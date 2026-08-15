"""情绪日记生成(会话结束闭环)。

LLM 一次调用产出 {journal_summary, journal_content, mood_score, emotion:{...}},
在同一事务原子写 Journal + Emotion(journal_id 关联)。
铁律:情绪记录只在生成日记时产出 —— Emotion 表写入仅发生在此模块。

同时把日记摘要回写 ChatSession.summary(长会话压缩)。
"""

from sqlalchemy.orm import Session

from app.adapters import llm
from app.models.emotion import EMOTION_CATEGORIES, Emotion, Journal
from app.models.session import ChatSession, Message

JOURNAL_SYSTEM_PROMPT = (
    "你是 MindHarbor 的情绪日记生成引擎。请基于下面的会话记录,以「用户的第一人称」写一篇情绪日记,输出 JSON:"
    '{"journal_summary": "一句话摘要(20字以内)",'
    '"journal_content": "日记正文(150-300字,温暖、接纳、不评判)",'
    '"mood_score": 1-10 的整数(1 最差,10 最好),'
    f'"emotion": {{"category": {EMOTION_CATEGORIES} 之一, "intensity": 1-10, '
    '"stress_source": 压力来源或空串, "support_need": 需要的支持或空串}}。'
    "只输出 JSON 对象。"
)


def _clamp_int(value, lo: int = 1, hi: int = 10, default: int = 5) -> int:
    try:
        return max(lo, min(hi, int(value)))
    except (TypeError, ValueError):
        return default


def _short(value, limit: int = 200) -> str | None:
    if not value:
        return None
    value = str(value).strip()
    return value if len(value) <= limit else value[:limit]


def generate(session_id: int, db: Session, user_id: int) -> Journal:
    """生成情绪日记 + 关联情绪记录(同一事务原子写入)。

    Raises:
        ValueError: 会话不存在 / LLM 输出缺摘要或正文。
    """
    session = db.get(ChatSession, session_id)
    if session is None:
        raise ValueError(f"会话不存在: {session_id}")
    messages = (
        db.query(Message).filter_by(session_id=session_id).order_by(Message.id).all()
    )
    transcript = "\n".join(f"{m.role}: {m.content}" for m in messages)
    if not transcript.strip():
        transcript = "(空会话)"

    data = llm.complete_json(JOURNAL_SYSTEM_PROMPT, transcript)

    summary = (data.get("journal_summary") or "").strip()
    content = (data.get("journal_content") or "").strip()
    if not summary or not content:
        raise ValueError("日记生成失败:LLM 输出缺少摘要或正文")

    emo = data.get("emotion") or {}
    category = emo.get("category") or "calm"
    if category not in EMOTION_CATEGORIES:
        category = "calm"

    try:
        journal = Journal(
            user_id=user_id,
            session_id=session_id,
            summary=summary[:2000],
            content=content[:5000],
            mood_score=_clamp_int(data.get("mood_score", 5)),
        )
        db.add(journal)
        db.flush()  # 拿到 journal.id 供 Emotion 关联
        db.add(
            Emotion(
                user_id=user_id,
                journal_id=journal.id,
                session_id=session_id,
                category=category,
                intensity=_clamp_int(emo.get("intensity", 1)),
                stress_source=_short(emo.get("stress_source")),
                support_need=_short(emo.get("support_need")),
            )
        )
        # 摘要回写会话(长会话压缩,供后续对话使用)
        session.summary = summary[:500]
        db.commit()
    except Exception:
        db.rollback()
        raise

    db.refresh(journal)
    return journal
