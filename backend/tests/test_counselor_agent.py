"""咨询师端 Agent 测试:工具注册、SQL Agent、异常学生识别、接口权限。

约定:LLM 一律 monkeypatch;SQL Agent 执行走测试库连接(monkeypatch db_engine)。
"""

from datetime import datetime, timedelta

import pytest

import pytest

from app.adapters import llm as llm_mod
from app.ai.counselor import counselor_registry
from app.core.security import hash_password
from app.models.emotion import Emotion
from app.models.session import ChatSession
from app.models.user import User

EXPECTED_COUNSELOR_TOOLS = {"query_student_stats", "search_student_journals", "find_at_risk_students"}


@pytest.fixture
def seed_counselor(db):
    """测试库没有 seed.py 的 counselor 账号,测试需自建。"""
    u = User(role="counselor", username="counselor", name="咨询师一号", password_hash=hash_password("counselor123"))
    db.add(u)
    db.commit()
    return u


def _login(client, username="counselor", password="counselor123"):
    r = client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200
    return r.json()["access_token"]


def test_counselor_registry_has_three_tools():
    assert set(counselor_registry.names()) == EXPECTED_COUNSELOR_TOOLS


def test_counselor_sql_agent_returns_table(db, engine, monkeypatch):
    """query_student_stats:自然语言 → 只读 SQL → 表格(headers/rows)。"""
    responses = iter([
        "SELECT u.name, AVG(e.intensity) AS avg_intensity FROM emotions e JOIN users u ON u.id=e.user_id GROUP BY u.name ORDER BY avg_intensity DESC LIMIT 5",
        "统计完成",
    ])
    monkeypatch.setattr(llm_mod, "complete_text", lambda system, user, **kw: next(responses))
    monkeypatch.setattr("app.ai.counselor_tools.db_engine", engine)

    handler = counselor_registry.get("query_student_stats").handler
    result = handler(db, 1, None, question="最近学生的情绪强度排名")

    assert result["type"] == "stats_table"
    assert result["headers"] == ["name", "avg_intensity"]
    assert result["row_count"] >= 0
    assert result["explanation"] == "统计完成"


@pytest.mark.parametrize(
    "bad_sql",
    ["DELETE FROM emotions", "SELECT * FROM users; SELECT 1", "SELECT * FROM resources"],
)
def test_counselor_sql_agent_rejects_unsafe(bad_sql, db, monkeypatch):
    monkeypatch.setattr(llm_mod, "complete_text", lambda system, user, **kw: bad_sql)
    handler = counselor_registry.get("query_student_stats").handler
    with pytest.raises(ValueError):
        handler(db, 1, None, question="随便")


def test_find_at_risk_students_identifies_high_risk(db):
    """识别情绪异常学生:高强度负面情绪 / 高风险会话。"""
    u = User(role="student", username="risk1", name="高危同学", password_hash="x")
    db.add(u)
    db.flush()
    db.add(
        Emotion(
            user_id=u.id, journal_id=None, session_id=None,
            category="anxious", intensity=9, stress_source="考试",
        )
    )
    db.add(ChatSession(user_id=u.id, title="高风险会话", risk_level="high"))
    db.commit()

    handler = counselor_registry.get("find_at_risk_students").handler
    result = handler(db, 1, None, days=14)

    assert result["type"] == "at_risk_students"
    assert any(s["name"] == "高危同学" for s in result["students"])


def test_search_student_journals_returns_entries(db):
    u = User(role="student", username="stu_j", name="小明", password_hash="x")
    db.add(u)
    db.flush()
    db.add(Emotion(user_id=u.id, journal_id=None, session_id=None, category="sad", intensity=6))
    db.commit()

    handler = counselor_registry.get("search_student_journals").handler
    result = handler(db, 1, None, student="小明")

    assert result["type"] == "student_journals"
    assert result["count"] >= 1
    assert result["entries"][0]["category"] == "sad"


def test_counselor_chat_endpoint_requires_counselor_role(client, seed_user, db):
    """学生访问咨询师接口 → 403。"""
    token = _login(client, username="stu1", password="pass123")  # student 账号
    r = client.post(
        "/api/v1/counselor/chat",
        json={"content": "查询统计"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 403


def test_counselor_chat_endpoint_works(client, db, seed_counselor, monkeypatch):
    """咨询师调用:Agent 工具循环 + 流式回复(monkeypatch LLM)。"""
    from app.ai import agent as agent_mod

    # 注册 counselor 账号(seed 里有 counselor/counselor123)
    token = _login(client)
    # 工具决策:第一轮返回无工具,直接流式回复
    monkeypatch.setattr(
        llm_mod, "chat_with_tools", lambda messages, tools, **kw: (None, [])
    )
    monkeypatch.setattr(llm_mod, "stream_chat", lambda messages, **kw: iter(["已", "查询", "完成"]))

    r = client.post(
        "/api/v1/counselor/chat",
        json={"content": "帮我看看学生的情绪分布"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    assert "text/event-stream" in r.headers["content-type"]

    import json

    texts = [
        json.loads(line[6:])["payload"]["content"]
        for line in r.text.splitlines()
        if line.strip().startswith("data: ")
    ]
    assert "".join(texts) == "已查询完成"  # 流式回复拼接完整
