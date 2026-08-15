"""记忆管理测试:情绪画像聚合(依据情绪日志)、稳定模式沉淀、滚动摘要。

约定:LLM 一律 monkeypatch(app.adapters.llm.complete_text),零真实 API。
"""

from app.ai import memory
from app.adapters import llm as llm_mod
from app.models.emotion import Emotion
from app.models.memory import UserMemory
from app.models.session import ChatSession, Message
from app.models.user import User


def _seed_user(db):
    u = User(role="student", username="mem1", name="记忆测试", password_hash="x")
    db.add(u)
    db.flush()
    return u


def test_emotion_profile_aggregates_trend_and_stress(db):
    """长期画像依据情绪日志:聚合主情绪、趋势、常驻压力源。"""
    u = _seed_user(db)
    # 4 条情绪:近 2 条强度高(焦虑),远 2 条强度低(calm)
    db.add_all(
        [
            Emotion(user_id=u.id, journal_id=None, session_id=None, category="calm", intensity=3, stress_source="考试"),
            Emotion(user_id=u.id, journal_id=None, session_id=None, category="calm", intensity=2, stress_source="考试"),
            Emotion(user_id=u.id, journal_id=None, session_id=None, category="anxious", intensity=7, stress_source="考试"),
            Emotion(user_id=u.id, journal_id=None, session_id=None, category="anxious", intensity=8, stress_source="考试"),
        ]
    )
    db.commit()

    lines = memory._emotion_profile(db, u.id)

    joined = "\n".join(lines)
    assert "anxious" in joined  # 主情绪
    assert "情绪趋势" in joined and "上升" in joined  # 强度上升趋势
    assert "常驻压力源" in joined and "考试" in joined  # 压力源 ≥2 次


def test_settle_long_term_memory_sediments_stable_pattern(db):
    """会话结束后沉淀长期记忆:同一压力源 ≥3 次 → UserMemory(profile)。"""
    u = _seed_user(db)
    for _ in range(3):
        db.add(Emotion(user_id=u.id, journal_id=None, session_id=None, category="anxious", intensity=7, stress_source="失眠"))
    db.commit()

    memory.settle_long_term_memory(db, u.id)

    settled = db.query(UserMemory).filter_by(user_id=u.id, memory_type="profile", source="emotion_log").all()
    assert len(settled) == 1
    assert "失眠" in settled[0].content
    assert settled[0].importance == 3


def test_rolling_summary_incremental(db, monkeypatch):
    """短期上下文记忆:滚动摘要——已有摘要时增量压缩(旧摘要+新增)。"""
    calls = []

    def fake_complete(system, user, **kw):
        calls.append((system, user))
        return "压缩后的摘要"

    monkeypatch.setattr(llm_mod, "complete_text", fake_complete)
    u = _seed_user(db)
    s = ChatSession(user_id=u.id, title="滚动", summary="旧版摘要")
    db.add(s)
    db.flush()
    msgs = [Message(session_id=s.id, role="user", content=f"消息{i}") for i in range(memory.SUMMARY_THRESHOLD)]
    db.add_all(msgs)
    db.commit()

    memory.update(s, msgs, u.id, db)

    assert s.summary == "压缩后的摘要"
    assert calls and "旧摘要" in calls[0][1]  # 增量压缩调用携带旧摘要
