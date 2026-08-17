"""Agent 编排 + 7 工具测试(Task 6,M4)。

约定:全部 monkeypatch LLM / embedding / TTS 适配器,零真实 API;
SQL Agent 执行走测试库连接(monkeypatch 工具模块的 db_engine)。
"""

import base64
import json
from datetime import datetime, timedelta

import pytest

from app.adapters import llm as llm_adapter
from app.ai import agent
from app.ai.rag.search import ChunkHit
from app.ai.tools import registry as tools_registry
from app.ai.tools.query_emotion_stats import ALLOWED_TABLES
from app.models.emotion import Emotion, Journal
from app.models.resource import Reminder, Resource
from app.models.session import ChatSession, Message
from app.models.user import User

EXPECTED_TOOL_NAMES = {
    "record_emotion",
    "search_knowledge",
    "generate_breathing",
    "create_reminder",
    "recommend_resources",
    "query_emotion_stats",
    "speak_voice",
}


@pytest.fixture
def seed_session(db, seed_user):
    """一个已存在会话 + 两条消息(record_emotion / SQL Agent 需要)。"""
    s = ChatSession(user_id=seed_user.id, title="测试会话")
    db.add(s)
    db.flush()
    db.add(Message(session_id=s.id, role="user", content="最近考试压力好大"))
    db.add(Message(session_id=s.id, role="assistant", content="我理解你的压力,慢慢来"))
    db.commit()
    return s


# ---------- 注册表 ----------


def test_registry_has_all_seven_tools():
    names = set(tools_registry.registry.names())
    assert names == EXPECTED_TOOL_NAMES


def test_registry_openai_tools_format():
    tools = tools_registry.registry.openai_tools()
    assert len(tools) == 7
    for t in tools:
        assert t["type"] == "function"
        assert t["function"]["name"] in EXPECTED_TOOL_NAMES
        assert "parameters" in t["function"]
        assert t["function"]["description"]


# ---------- 工具执行 ----------


def test_record_emotion_tool_writes_journal_and_emotion(db, seed_user, seed_session, monkeypatch):
    """record_emotion:LLM 日记生成 → Journal+Emotion 原子落库(铁律路径)。"""
    fake_diary = {
        "journal_summary": "考试压力需要被看见",
        "journal_content": "今天的我在为考试焦虑……",
        "mood_score": 5,
        "emotion": {
            "category": "anxious",
            "intensity": 7,
            "stress_source": "考试",
            "support_need": "倾诉",
        },
    }
    monkeypatch.setattr(llm_adapter, "complete_json", lambda system, user, **kw: fake_diary)

    handler = tools_registry.registry.get("record_emotion").handler
    result = handler(db, seed_user.id, seed_session.id)

    journal = db.query(Journal).filter_by(session_id=seed_session.id).one()
    emo = db.query(Emotion).filter_by(journal_id=journal.id).one()
    assert emo.user_id == seed_user.id
    assert emo.category == "anxious"
    assert result["journal_id"] == journal.id
    assert result["emotion"]["category"] == "anxious"


def test_search_knowledge_tool_returns_hits(monkeypatch, db, seed_user):
    hits = [ChunkHit(text="考前压力应对:规律作息……", doc_title="考前压力应对", chunk_id=1, score=0.9)]
    captured = {}

    def fake_search(query, **kw):
        captured["query"] = query
        return hits

    monkeypatch.setattr("app.ai.tools.search_knowledge.rag_search.search", fake_search)

    handler = tools_registry.registry.get("search_knowledge").handler
    result = handler(db, seed_user.id, 1, query="我想知道考试压力怎么办")

    assert result["count"] == 1
    assert result["hits"][0]["title"] == "考前压力应对"
    # 查询词已精炼:去掉"我想知道/怎么办"等语气词,保留核心检索词
    assert "我想知道" not in captured["query"]
    assert "考试压力" in captured["query"]


def test_refine_query_extracts_core_terms():
    from app.ai.tools.search_knowledge import _refine_query

    assert "心理咨询中心" in _refine_query("我想去学校心理咨询中心,请问怎么预约?")
    assert "请问" not in _refine_query("请问考试焦虑怎么缓解")
    assert _refine_query("") == ""


def test_generate_breathing_tool(db, seed_user):
    handler = tools_registry.registry.get("generate_breathing").handler
    result = handler(db, seed_user.id, 1, exercise="478")
    assert result["exercise"] == "478"
    assert len(result["steps"]) >= 3

    # 非法 exercise 回落默认
    result2 = handler(db, seed_user.id, 1, exercise="不存在")
    assert result2["exercise"] == "478"


def test_create_reminder_tool(db, seed_user):
    remind_at = (datetime.now() + timedelta(days=1)).isoformat()
    handler = tools_registry.registry.get("create_reminder").handler
    result = handler(db, seed_user.id, 1, content="晚上复习高数", remind_at=remind_at)

    r = db.query(Reminder).filter_by(user_id=seed_user.id).one()
    assert r.content == "晚上复习高数"
    assert result["reminder_id"] == r.id


def test_recommend_resources_tool_filters_active(db, seed_user):
    db.add_all(
        [
            Resource(title="考试减压", type="article", is_active=True),
            Resource(title="已下架资源", type="article", is_active=False),
        ]
    )
    db.commit()

    handler = tools_registry.registry.get("recommend_resources").handler
    result = handler(db, seed_user.id, 1, need="考试")

    assert len(result["resources"]) == 1
    assert result["resources"][0]["title"] == "考试减压"


class FakeSqlLlm:
    """按序返回 complete_text 响应(SQL 生成 → 结果解释)。"""

    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def complete_text(self, system, user, **kw):
        self.calls.append(user)
        return self.responses.pop(0)


def test_query_emotion_stats_returns_own_rows_only(db, seed_user, seed_session, engine, monkeypatch):
    """SQL Agent:合法查询注入 user_id 隔离 + 只读执行。"""
    db.add(Emotion(user_id=seed_user.id, journal_id=None, session_id=seed_session.id,
                   category="anxious", intensity=7))
    other = db.query(User).filter_by(username="stu2").first()
    if other is None:
        other = User(role="student", username="stu2", name="他人", password_hash="x")
        db.add(other)
        db.flush()
    db.add(Emotion(user_id=other.id, journal_id=None, session_id=None, category="calm", intensity=3))
    db.commit()

    fake = FakeSqlLlm([
        "SELECT category, COUNT(*) AS cnt FROM emotions GROUP BY category",
        "统计完成",
    ])
    monkeypatch.setattr(llm_adapter, "complete_text", fake.complete_text)
    monkeypatch.setattr("app.ai.tools.query_emotion_stats.db_engine", engine)

    handler = tools_registry.registry.get("query_emotion_stats").handler
    result = handler(db, seed_user.id, seed_session.id, question="我最近的情绪分布")

    assert result["explanation"] == "统计完成"
    rows = result["rows"]
    assert len(rows) == 1  # 只统计本人(anxious 1 条;他人的 calm 被隔离)
    assert rows[0]["cnt"] == 1


@pytest.mark.parametrize(
    "bad_sql",
    [
        "DELETE FROM emotions",          # DML
        "SELECT * FROM users",           # 表白名单外
        "SELECT 1; SELECT 2",            # 多语句
        "SELECT * FROM emotions; DROP TABLE journals",  # 注入尾随
    ],
)
def test_query_emotion_stats_rejects_unsafe_sql(bad_sql, db, seed_user, monkeypatch):
    fake = FakeSqlLlm([bad_sql])
    monkeypatch.setattr(llm_adapter, "complete_text", fake.complete_text)

    handler = tools_registry.registry.get("query_emotion_stats").handler
    with pytest.raises(ValueError):
        handler(db, seed_user.id, 1, question="随便")


def test_speak_voice_tool_returns_url(db, seed_user, monkeypatch):
    monkeypatch.setattr(
        "app.ai.tools.speak_voice.tts.synthesize_with_url",
        lambda text, **kw: {"audio": b"fake-audio", "url": "https://example.com/voice.mp3"},
    )

    handler = tools_registry.registry.get("speak_voice").handler
    result = handler(db, seed_user.id, 1, text="我在这里陪着你")

    assert result["url"] == "https://example.com/voice.mp3"
    assert result["text"] == "我在这里陪着你"


def test_speak_voice_tool_degrades_when_tts_fails(db, seed_user, monkeypatch):
    """TTS 不可用 → 降级文本卡片,不抛异常、不中断 Agent 循环。"""

    def boom(text, **kw):
        raise RuntimeError("TTS 404")

    monkeypatch.setattr("app.ai.tools.speak_voice.tts.synthesize_with_url", boom)

    handler = tools_registry.registry.get("speak_voice").handler
    result = handler(db, seed_user.id, 1, text="我在这里陪着你")

    assert result["type"] == "voice"
    assert result["url"] is None
    assert result["degraded"] is True
    assert result["text"] == "我在这里陪着你"


# ---------- agent 循环 ----------


def test_agent_run_executes_tool_and_returns_cards(db, seed_user, seed_session, monkeypatch):
    """一轮工具调用:第一次 LLM 请求返回 tool_call,执行后第二次无 tool_call 结束。"""
    calls = []

    def fake_chat_with_tools(messages, tools, **kw):
        calls.append(len(calls))
        if len(calls) == 1:
            return (
                None,
                [{
                    "id": "call-1",
                    "type": "function",
                    "function": {"name": "generate_breathing", "arguments": json.dumps({"exercise": "478"})},
                }],
            )
        return ("好的,我们一起来呼吸", [])

    monkeypatch.setattr(llm_adapter, "chat_with_tools", fake_chat_with_tools)

    cards, tool_context = agent.run(
        db, seed_user.id, seed_session.id, "我有点焦虑",
        system_prompt="你是陪伴助手", context="(无知识参考)",
    )

    assert len(calls) == 2
    assert len(cards) == 1
    assert cards[0]["type"] == "breathing"
    assert "吸气" in tool_context
    assert tool_context.startswith("【工具结果】")


def test_agent_run_without_tool_calls(db, seed_user, seed_session, monkeypatch):
    monkeypatch.setattr(
        llm_adapter,
        "chat_with_tools",
        lambda messages, tools, **kw: (None, []),
    )
    cards, tool_context = agent.run(
        db, seed_user.id, seed_session.id, "你好",
        system_prompt="你是陪伴助手", context="",
    )
    assert cards == []
    assert tool_context == ""


def test_agent_run_executes_multiple_tools_in_one_round(db, seed_user, seed_session, monkeypatch):
    """一轮返回多个 tool_call(如 search_knowledge + speak_voice)→ 全部执行。"""

    calls = []

    def multi_tool(messages, tools, **kw):
        calls.append(1)
        if len(calls) == 1:  # 第一轮返回两个 tool_call
            return (
                None,
                [
                    {"id": "c1", "type": "function", "function": {"name": "generate_breathing", "arguments": "{}"}},
                    {"id": "c2", "type": "function", "function": {"name": "generate_breathing", "arguments": json.dumps({"exercise": "box"})}},
                ],
            )
        return (None, [])  # 第二轮结束

    monkeypatch.setattr(llm_adapter, "chat_with_tools", multi_tool)

    cards, _ = agent.run(
        db, seed_user.id, seed_session.id, "帮我放松",
        system_prompt="你是陪伴助手", context="",
    )
    assert len(cards) == 2  # 两个工具都执行
    assert cards[0]["exercise"] == "478"
    assert cards[1]["exercise"] == "box"


def test_agent_run_max_rounds_guard(db, seed_user, seed_session, monkeypatch):
    """每轮都返回 tool_call:最多 MAX_TOOL_ROUNDS 轮后停止,不无限循环。"""

    def always_tool(messages, tools, **kw):
        return (
            None,
            [{
                "id": "call-x",
                "type": "function",
                "function": {"name": "generate_breathing", "arguments": "{}"},
            }],
        )

    monkeypatch.setattr(llm_adapter, "chat_with_tools", always_tool)

    cards, _ = agent.run(
        db, seed_user.id, seed_session.id, "我一直焦虑",
        system_prompt="你是陪伴助手", context="",
    )
    assert len(cards) == agent.MAX_TOOL_ROUNDS
