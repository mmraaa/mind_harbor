"""上下文记忆管理。

- 短期窗口:最近 N 轮 Message(默认 10);
- 会话摘要:ChatSession.summary(长会话 > 2N 且尚无摘要 → LLM 压缩生成);
- 长期画像:UserMemory(fact, 按 importance 取前若干)+ Emotion 聚合(近期情绪分布);
- `assemble_context` 按「长期记忆 → 会话摘要 → 近期对话 → 知识参考」拼接提示词上下文。

隐私约束(设计文档):仅沉淀对话中明确且非敏感的信息;危机/敏感内容不进入长期记忆。
"""

import re
from collections import Counter

from sqlalchemy.orm import Session

from app.adapters import llm
from app.models.emotion import Emotion
from app.models.memory import UserMemory
from app.models.session import ChatSession, Message

SHORT_TERM_WINDOW = 10  # 短期记忆窗口(轮数)
SUMMARY_THRESHOLD = SHORT_TERM_WINDOW * 2  # 超过该轮数且无摘要 → 压缩

SUMMARY_SYSTEM_PROMPT = (
    "你是 MindHarbor 的会话摘要引擎。请把下面的对话压缩成 3-5 句话的第三人称摘要,"
    "保留:用户身份信息、主要话题、情绪变化、已给出的建议与用户反馈。只输出摘要正文,不要加标题。"
)

# 规则抽取的长期画像事实模式(不调 LLM):名字 / 年级专业
FACT_PATTERNS = [
    re.compile(r"我叫([一-龥]{2,8})(?:,|，|。| |$)"),
    re.compile(r"我是(.{1,20}?(?:专业|大一|大二|大三|大四|研究生|毕业生))"),
]


def _long_term_profile(db: Session, user_id: int) -> str:
    """长期画像:UserMemory 事实 + 近期 Emotion 聚合(主情绪 + 平均强度)。"""
    lines = []
    facts = (
        db.query(UserMemory)
        .filter_by(user_id=user_id)
        .order_by(UserMemory.importance.desc(), UserMemory.id.desc())
        .limit(10)
        .all()
    )
    if facts:
        lines.append("用户画像:" + " ; ".join(f.content for f in facts))

    emotions = (
        db.query(Emotion)
        .filter(Emotion.user_id == user_id)
        .order_by(Emotion.id.desc())
        .limit(20)
        .all()
    )
    if emotions:
        top_cat, _ = Counter(e.category for e in emotions).most_common(1)[0]
        avg = round(sum(e.intensity for e in emotions) / len(emotions), 1)
        lines.append(f"近期情绪:以「{top_cat}」为主(近 {len(emotions)} 条),平均强度 {avg}")
    return "\n".join(lines)


def assemble_context(
    session: ChatSession,
    messages: list[Message],
    user_id: int,
    db: Session,
    rag_hits: list | None = None,
) -> str:
    """拼装对话上下文(供 system 提示词):长期画像 + 会话摘要 + 短期窗口 + 知识参考。"""
    parts = []
    profile = _long_term_profile(db, user_id)
    if profile:
        parts.append("【长期记忆】\n" + profile)
    if session.summary:
        parts.append("【会话摘要】\n" + session.summary)
    recent = messages[-SHORT_TERM_WINDOW:]
    if recent:
        parts.append("【近期对话】\n" + "\n".join(f"{m.role}: {m.content}" for m in recent))
    if rag_hits:
        refs = [f"[{h.doc_title}] {h.text[:200]}" for h in rag_hits]
        parts.append("【知识参考】\n" + "\n".join(refs))
    return "\n\n".join(parts)


def update(session: ChatSession, messages: list[Message], user_id: int, db: Session) -> None:
    """更新记忆(每轮对话后调用):

    1. 长会话摘要压缩:消息数 >= SUMMARY_THRESHOLD 且无摘要 → LLM 生成存 ChatSession.summary;
    2. 规则抽取事实沉淀到 UserMemory(fact, 去重, 不调 LLM)。
    """
    if len(messages) >= SUMMARY_THRESHOLD and not session.summary:
        transcript = "\n".join(f"{m.role}: {m.content}" for m in messages)
        session.summary = llm.complete_text(SUMMARY_SYSTEM_PROMPT, transcript)
        db.add(session)

    for msg in messages[-SHORT_TERM_WINDOW:]:
        if msg.role != "user":
            continue
        for pat in FACT_PATTERNS:
            m = pat.search(msg.content)
            if not m:
                continue
            content = m.group(0)
            exists = db.query(UserMemory).filter_by(user_id=user_id, content=content).first()
            if not exists:
                db.add(UserMemory(user_id=user_id, memory_type="fact", content=content, source="chat"))
            break  # 每条消息只沉淀一条事实
