"""对话主流程 + 情绪日记闭环测试(Task 5)。

约定:
- LLM 一律 monkeypatch `app.adapters.llm`(complete_json / stream_chat / complete_text),不真实打 API;
- RAG 的 `search` 也 patch(避免真实 embedding / Milvus);
- 数据库经 `conftest.py` 的 client/db fixture 切到 mindharbor_test。
"""

import json
import logging

import pytest

from app.adapters import llm as llm_mod
from app.ai.rag import search as rag_search_mod
from app.ai.rag.search import ChunkHit
from app.models.emotion import Emotion, Journal
from app.models.memory import UserMemory
from app.models.session import ChatSession, Message
from app.models.user import User


def _login(client, username="stu1", password="pass123"):
    r = client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200
    return r.json()["access_token"]


def _headers(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- 假 LLM / 假 RAG ----------


def fake_complete_json(system: str, user: str, **kw) -> dict:
    """按 prompt 分支:情绪识别 / 日记生成,返回各自结构化 JSON。"""
    if "日记" in system:
        return {
            "journal_summary": "聊了考试焦虑与应对方法",
            "journal_content": "今天我和 MindHarbor 聊了考试前的焦虑。心跳很快,注意力不太集中。AI 陪我分析了原因,还分享了拆解复习计划的正念呼吸方法。感觉没那么慌了,也有了具体的行动方向。",
            "mood_score": 5,
            "emotion": {"category": "anxious", "intensity": 6, "stress_source": "期末考试", "support_need": "学习方法建议"},
        }
    return {
        "category": "anxious",
        "intensity": 6,
        "stress_source": "期末考试",
        "support_need": "鼓励",
        "is_risk": False,
        "risk_reason": "",
    }


def fake_stream_chat(messages, **kw):
    for t in ["我", "理解", "你的焦虑"]:
        yield t


def fake_search(query, top_k=5, keyword=None, **kw):
    return [ChunkHit(text="考试焦虑可通过拆分复习计划与正念呼吸缓解。", doc_title="考试焦虑应对")]


@pytest.fixture
def patch_ai(monkeypatch):
    monkeypatch.setattr(llm_mod, "complete_json", fake_complete_json)
    monkeypatch.setattr(llm_mod, "stream_chat", fake_stream_chat)
    monkeypatch.setattr(llm_mod, "complete_text", lambda *a, **k: "测试摘要")
    # Agent 工具循环:默认不调用任何工具(工具测试见 test_agent.py)
    monkeypatch.setattr(llm_mod, "chat_with_tools", lambda messages, tools, **kw: (None, []))
    monkeypatch.setattr(rag_search_mod, "search", fake_search)


def _parse_sse(resp_text: str) -> list[dict]:
    """解析 SSE 文本 → 事件 dict 列表。"""
    events = []
    for line in resp_text.splitlines():
        if line.startswith("data: "):
            events.append(json.loads(line[len("data: "):]))
    return events


# ---------- 主流程:识别 → 流式回复 → 落库 ----------


def test_chat_creates_session_streams_reply_and_persists(client, seed_user, patch_ai, db):
    token = _login(client)
    r = client.post("/api/v1/chat", json={"content": "最近考试压力好大"}, headers=_headers(token))
    assert r.status_code == 200
    assert "text/event-stream" in r.headers["content-type"]

    events = _parse_sse(r.text)
    assert [e["payload"]["content"] for e in events if e["type"] == "text"] == ["我", "理解", "你的焦虑"]
    sources = [e for e in events if e["type"] == "tool_card"]
    assert sources and sources[0]["payload"]["type"] == "sources"

    session = db.query(ChatSession).one()
    assert session.user_id == seed_user.id
    assert session.status == "active"
    assert session.title  # 首条消息自动命名

    msgs = db.query(Message).order_by(Message.id).all()
    assert [m.role for m in msgs] == ["user", "assistant"]
    assert msgs[0].content == "最近考试压力好大"
    # 情绪识别结果作为 emotion_tags 挂在助手消息上
    assert msgs[1].emotion_tags == ["anxious"]
    assert msgs[1].tool_cards and msgs[1].tool_cards[0]["type"] == "sources"


def test_chat_reuses_existing_session(client, seed_user, patch_ai, db):
    token = _login(client)
    first = client.post("/api/v1/chat", json={"content": "第一轮"}, headers=_headers(token))
    session_id = db.query(ChatSession).one().id
    second = client.post(
        "/api/v1/chat", json={"session_id": session_id, "content": "第二轮"}, headers=_headers(token)
    )
    assert second.status_code == 200
    assert db.query(ChatSession).count() == 1
    assert db.query(Message).count() == 4


# ---------- 风险筛查 ----------


def test_risk_keyword_triggers_template_and_marks_session(client, seed_user, patch_ai, db):
    token = _login(client)
    r = client.post("/api/v1/chat", json={"content": "我真的不想活了"}, headers=_headers(token))
    assert r.status_code == 200

    events = _parse_sse(r.text)
    text = "".join(e["payload"]["content"] for e in events if e["type"] == "text")
    assert "400-161-9995" in text
    crisis = [e for e in events if e["type"] == "tool_card"]
    assert crisis and crisis[0]["payload"]["type"] == "crisis"

    session = db.query(ChatSession).one()
    assert session.risk_level == "high"
    msgs = db.query(Message).order_by(Message.id).all()
    assert [m.role for m in msgs] == ["user", "assistant"]
    assert "400-161-9995" in msgs[-1].content


def test_risk_via_llm_judgement(client, seed_user, db, monkeypatch):
    token = _login(client)
    monkeypatch.setattr(llm_mod, "stream_chat", fake_stream_chat)
    monkeypatch.setattr(rag_search_mod, "search", fake_search)

    def risky_json(system, user, **kw):
        return {
            "category": "sad",
            "intensity": 9,
            "stress_source": "学业",
            "support_need": "紧急支持",
            "is_risk": True,
            "risk_reason": "表达了轻生念头",
        }

    monkeypatch.setattr(llm_mod, "complete_json", risky_json)
    r = client.post("/api/v1/chat", json={"content": "最近很崩溃"}, headers=_headers(token))
    assert r.status_code == 200
    session = db.query(ChatSession).one()
    assert session.risk_level == "high"
    # LLM 判定命中 → 同样走风险模板,而非 LLM 流式回复
    msgs = db.query(Message).order_by(Message.id).all()
    assert "400-161-9995" in msgs[-1].content


# ---------- 日记闭环 ----------


def test_end_session_generates_journal_with_linked_emotion(client, seed_user, patch_ai, db):
    token = _login(client)
    r = client.post(
        "/api/v1/chat", json={"content": "聊聊考试", "end_session": True}, headers=_headers(token)
    )
    assert r.status_code == 200

    events = _parse_sse(r.text)
    j_evt = next(e for e in events if e["type"] == "journal")
    assert j_evt["payload"]["summary"] == "聊了考试焦虑与应对方法"
    assert j_evt["payload"]["mood_score"] == 5
    assert j_evt["payload"]["emotion"]["category"] == "anxious"

    journal = db.query(Journal).one()
    emotion = db.query(Emotion).one()
    assert journal.user_id == seed_user.id
    assert journal.session_id == j_evt["payload"]["journal_id"] == journal.id
    # Journal ↔ Emotion 关联
    assert emotion.journal_id == journal.id
    assert emotion.category == "anxious"
    assert emotion.intensity == 6
    assert emotion.user_id == seed_user.id

    session = db.query(ChatSession).one()
    assert session.status == "closed"
    assert session.summary == journal.summary  # 摘要回写会话


def test_risk_end_session_still_writes_journal(client, seed_user, patch_ai, db):
    token = _login(client)
    r = client.post(
        "/api/v1/chat",
        json={"content": "我不想活了", "end_session": True},
        headers=_headers(token),
    )
    assert r.status_code == 200
    events = _parse_sse(r.text)
    assert any(e["type"] == "journal" for e in events)
    assert db.query(Journal).count() == 1
    assert db.query(Emotion).count() == 1
    session = db.query(ChatSession).one()
    assert session.status == "closed"
    assert session.risk_level == "high"


# ---------- SSE 事件格式(ruling) ----------


def test_sse_event_format(client, seed_user, patch_ai):
    token = _login(client)
    r = client.post("/api/v1/chat", json={"content": "你好"}, headers=_headers(token))
    lines = r.text.splitlines()
    # 每事件一行 data: {json},后跟一个空行
    assert lines[0].startswith("data: ")
    assert lines[1] == ""
    assert all(line.startswith("data: ") or line == "" for line in lines)
    for line in lines:
        if line.startswith("data: "):
            evt = json.loads(line[len("data: "):])
            assert set(evt.keys()) == {"type", "payload"}


# ---------- error 事件兜底 ----------


@pytest.mark.parametrize("blank", ["", "   ", "\t\n  "])
def test_chat_blank_content_yields_error_without_creating_session(
    client, seed_user, patch_ai, db, blank
):
    """空/空白内容 → type==error 事件,且不创建孤儿会话。"""
    token = _login(client)
    r = client.post("/api/v1/chat", json={"content": blank}, headers=_headers(token))
    assert r.status_code == 200
    assert "text/event-stream" in r.headers["content-type"]

    events = _parse_sse(r.text)
    assert len(events) == 1
    assert events[0]["type"] == "error"
    assert set(events[0].keys()) == {"type", "payload"}
    assert events[0]["payload"]["message"] == "消息内容不能为空"

    assert db.query(ChatSession).count() == 0
    assert db.query(Message).count() == 0


def test_journal_generation_failure_yields_error_event(
    client, seed_user, patch_ai, db, monkeypatch, caplog
):
    """日记生成抛异常 → type==error 事件;通用文案,异常详情只进日志。"""
    caplog.set_level(logging.ERROR)
    token = _login(client)

    def json_with_journal_failure(system, user, **kw):
        if "日记" in system:
            raise RuntimeError("日记模型超时")
        return fake_complete_json(system, user, **kw)

    monkeypatch.setattr(llm_mod, "complete_json", json_with_journal_failure)
    r = client.post(
        "/api/v1/chat",
        json={"content": "聊聊考试", "end_session": True},
        headers=_headers(token),
    )
    assert r.status_code == 200

    events = _parse_sse(r.text)
    assert any(e["type"] == "text" for e in events)  # 正常回复先到达
    errs = [e for e in events if e["type"] == "error"]
    assert len(errs) == 1
    assert errs[0]["payload"]["message"] == "生成过程出现异常,请稍后重试"
    assert "日记模型超时" not in errs[0]["payload"]["message"]  # 不泄露异常原文
    assert not any(e["type"] == "journal" for e in events)

    assert db.query(Journal).count() == 0
    session = db.query(ChatSession).one()
    assert session.status == "active"  # 日记失败 → 不标记 closed
    assert "日记模型超时" in caplog.text  # 异常详情进日志


def test_chat_mid_stream_exception_yields_error_event(
    client, seed_user, patch_ai, monkeypatch, caplog
):
    """流中途异常 → gen() 兜底产出 type==error 事件,不中断流、不泄异常。"""
    caplog.set_level(logging.ERROR)
    token = _login(client)

    def stream_then_raise(messages, **kw):
        yield "我"  # 已产出增量后才抛错,模拟流中途中断
        raise RuntimeError("流式连接中断")

    monkeypatch.setattr(llm_mod, "stream_chat", stream_then_raise)
    r = client.post("/api/v1/chat", json={"content": "你好"}, headers=_headers(token))
    assert r.status_code == 200

    events = _parse_sse(r.text)
    assert [e["payload"]["content"] for e in events if e["type"] == "text"] == ["我"]
    errs = [e for e in events if e["type"] == "error"]
    assert len(errs) == 1
    assert errs[0]["payload"]["message"] == "生成过程出现异常,请稍后重试"
    assert "流式连接中断" not in errs[0]["payload"]["message"]
    assert "流式连接中断" in caplog.text


# ---------- 会话权限 ----------


def test_chat_requires_auth(client, seed_user, patch_ai):
    assert client.post("/api/v1/chat", json={"content": "你好"}).status_code == 401


def test_chat_rejects_foreign_session(client, seed_user, patch_ai, db):
    token = _login(client)
    other = User(role="student", username="stu2", name="他人", password_hash="x")
    db.add(other)
    db.commit()
    s = ChatSession(user_id=other.id)
    db.add(s)
    db.commit()
    r = client.post(
        "/api/v1/chat", json={"session_id": s.id, "content": "你好"}, headers=_headers(token)
    )
    assert r.status_code == 403


def test_chat_unknown_session_404(client, seed_user, patch_ai):
    token = _login(client)
    r = client.post("/api/v1/chat", json={"session_id": 99999, "content": "你好"}, headers=_headers(token))
    assert r.status_code == 404


# ---------- 记忆管理 ----------


def test_assemble_context_sections(client, seed_user, patch_ai, db):
    from app.ai import memory

    s = ChatSession(user_id=seed_user.id, summary="此前聊过失眠")
    msgs = [Message(session_id=0, role="user", content="最近睡得不好")]
    ctx = memory.assemble_context(
        s,
        msgs,
        seed_user.id,
        db,
        rag_hits=[ChunkHit(text="正念呼吸可助眠。", doc_title="睡眠指南")],
    )
    assert "此前聊过失眠" in ctx          # 会话摘要
    assert "最近睡得不好" in ctx          # 短期窗口
    assert "【知识参考】" in ctx          # RAG
    assert "睡眠指南" in ctx


def test_memory_update_extracts_facts_and_compresses_summary(client, seed_user, patch_ai, db):
    from app.ai import memory

    s = ChatSession(user_id=seed_user.id, title="测试", summary="")
    db.add(s)
    db.flush()
    msgs = [
        Message(session_id=s.id, role="user", content="我叫小明" if i == 20 else f"第{i}轮内容")
        if i % 2 == 0
        else Message(session_id=s.id, role="assistant", content=f"回复{i}")
        for i in range(21)
    ]
    db.add_all(msgs)
    db.commit()

    memory.update(s, msgs, seed_user.id, db)
    db.commit()

    facts = db.query(UserMemory).filter_by(user_id=seed_user.id).all()
    assert any("我叫小明" in f.content for f in facts)
    db.refresh(s)
    assert s.summary == "测试摘要"  # 超过阈值 → LLM 摘要压缩(假 complete_text)
