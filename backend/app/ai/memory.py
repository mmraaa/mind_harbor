"""上下文记忆管理(完善版,2026-08-15)。

分层记忆:
- 短期上下文记忆:最近 N 轮 Message(窗口)+ 滚动会话摘要(ChatSession.summary);
- 长期记忆(可依据情绪日志):UserMemory(fact/profile)+ 情绪画像聚合——
  从 journals/emotions 提炼情绪趋势、常驻压力源,会话结束时把稳定模式沉淀为 UserMemory。

隐私约束(设计文档):仅沉淀对话中明确且非敏感的信息;危机/敏感内容不进入长期记忆。
"""

import re
from collections import Counter

from sqlalchemy.orm import Session

from app.adapters import llm
from app.services import user_memory as user_memory_service
from app.models.emotion import Emotion
from app.models.memory import UserMemory
from app.models.session import ChatSession, Message

SHORT_TERM_WINDOW = 10  # 短期记忆窗口(轮数)
SUMMARY_THRESHOLD = SHORT_TERM_WINDOW * 2  # 每积累该轮数 → 滚动压缩会话摘要
EMOTION_PROFILE_N = 20  # 情绪画像取最近 N 条
SETTLE_STRESS_MIN = 3  # 同一压力源出现 ≥3 次 → 沉淀长期记忆
SETTLE_STRESS_TOP = 3

SUMMARY_SYSTEM_PROMPT = (
    "你是 MindHarbor 的会话摘要引擎。请把下面的对话压缩成 3-5 句话的第三人称摘要,"
    "保留:用户身份信息、主要话题、情绪变化、已给出的建议与用户反馈。只输出摘要正文,不要加标题。"
)

ROLLING_SUMMARY_PROMPT = (
    "你是 MindHarbor 的会话摘要引擎。请把「旧摘要」与「新增对话」合并压缩成一份更新的"
    "第三人称摘要(3-5 句),保留:身份信息、持续话题、情绪变化、已给出的建议与反馈。只输出摘要正文。"
)

# 规则抽取的长期画像事实模式(不调 LLM):名字 / 年级专业
FACT_PATTERNS = [
    re.compile(r"我叫([一-龥]{2,8})(?:,|，|。| |$)"),
    re.compile(r"我是(.{1,20}?(?:专业|大一|大二|大三|大四|研究生|毕业生))"),
]


def _emotion_profile(db: Session, user_id: int, recent_n: int = EMOTION_PROFILE_N) -> list[str]:
    """从情绪日志(journals/emotions)聚合长期情绪画像:主情绪、趋势、常驻压力源。

    依据情绪日志(设计 2026-08-15):近 N 条情绪记录动态聚合,不冗余存储。
    """
    emotions = (
        db.query(Emotion)
        .filter(Emotion.user_id == user_id)
        .order_by(Emotion.id.desc())
        .limit(recent_n * 2)
        .all()
    )
    if not emotions:
        return []
    recent = emotions[:recent_n]
    lines: list[str] = []

    top_cat, cnt = Counter(e.category for e in recent).most_common(1)[0]
    avg = round(sum(e.intensity for e in recent) / len(recent), 1)
    lines.append(f"近期情绪:以「{top_cat}」为主({cnt}/{len(recent)} 条),平均强度 {avg}")

    # 情绪趋势:近半 vs 更早半 强度对比(≥4 条且差异明显才提示)
    if len(recent) >= 4:
        half = len(recent) // 2
        older, newer = recent[half:], recent[:half]
        o_avg = sum(e.intensity for e in older) / len(older)
        n_avg = sum(e.intensity for e in newer) / len(newer)
        diff = n_avg - o_avg
        if abs(diff) >= 1:
            trend = "情绪强度上升,压力在累积" if diff > 0 else "情绪强度下降,正在好转"
            lines.append(f"情绪趋势:{trend}(近 {len(newer)} 条均值 {n_avg:.1f} vs 更早 {o_avg:.1f})")

    # 常驻压力源 / 支持需求(出现 ≥2 次)
    src = Counter(e.stress_source for e in recent if e.stress_source)
    top_src = [s for s, c in src.most_common(SETTLE_STRESS_TOP) if c >= 2]
    if top_src:
        lines.append("常驻压力源:" + "、".join(top_src))
    need = Counter(e.support_need for e in recent if e.support_need)
    top_need = [n for n, c in need.most_common(2) if c >= 2]
    if top_need:
        lines.append("长期支持需求:" + "、".join(top_need))
    return lines


def _long_term_profile(db: Session, user_id: int, current_text: str | None = None) -> str:
    """长期记忆摘要 + 兼容的情绪日志聚合画像。"""
    lines = []
    context = user_memory_service.memory_context_for_chat(db, user_id, current_text)
    if context:
        lines.append(context)
    lines.extend(_emotion_profile(db, user_id))
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
    current_text = next((message.content for message in reversed(messages) if message.role == "user"), None)
    profile = _long_term_profile(db, user_id, current_text)
    if profile:
        parts.append("【长期记忆】\n" + profile)
    if session.summary:
        parts.append("【会话摘要】\n" + session.summary)
    recent = messages[-SHORT_TERM_WINDOW:]
    if recent:
        parts.append("【近期对话】\n" + "\n".join(f"{m.role}: {m.content}" for m in recent))
    if rag_hits:
        refs = [f"[{h.doc_title}] {(h.context or h.text)[:300]}" for h in rag_hits]
        parts.append("【知识参考】\n" + "\n".join(refs))
    return "\n\n".join(parts)


def update(session: ChatSession, messages: list[Message], user_id: int, db: Session) -> None:
    """更新记忆(每轮对话后调用):

    1. 短期上下文记忆 —— 滚动会话摘要:每积累 SUMMARY_THRESHOLD 轮,用 LLM 增量压缩
       「旧摘要 + 新增对话」(已有摘要时),无摘要则生成首版;
    2. 规则抽取事实沉淀到 UserMemory(fact, 去重, 不调 LLM)。
    """
    if len(messages) >= SUMMARY_THRESHOLD and (not session.summary or len(messages) % SUMMARY_THRESHOLD == 0):
        # 首次达到阈值即生成首版;之后每满阈值用「旧摘要 + 新增」增量滚动
        recent_part = "\n".join(f"{m.role}: {m.content}" for m in messages[-SUMMARY_THRESHOLD:])
        if session.summary:
            session.summary = llm.complete_text(
                ROLLING_SUMMARY_PROMPT,
                f"旧摘要:\n{session.summary}\n\n新增对话:\n{recent_part}",
            )
        else:
            session.summary = llm.complete_text(SUMMARY_SYSTEM_PROMPT, recent_part)
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


def settle_long_term_memory(db: Session, user_id: int) -> None:
    """会话结束时沉淀长期记忆(依据情绪日志):稳定压力源模式 → UserMemory(profile)。

    当同一压力源在情绪记录中出现 >= SETTLE_STRESS_MIN 次,沉淀一条长期画像记忆
    (跨会话持续使用);已存在则更新 importance 与 updated_at。
    """
    emotions = db.query(Emotion).filter(Emotion.user_id == user_id).all()
    src = Counter(e.stress_source for e in emotions if e.stress_source)
    for stress, count in src.most_common(SETTLE_STRESS_TOP):
        if count < SETTLE_STRESS_MIN:
            continue
        content = f"长期受「{stress}」困扰(情绪记录中出现 {count} 次)"
        existing = (
            db.query(UserMemory)
            .filter_by(user_id=user_id, memory_type="profile", content=content)
            .first()
        )
        if existing:
            existing.importance = 3
            continue
        db.add(
            UserMemory(
                user_id=user_id,
                memory_type="profile",
                content=content,
                importance=3,
                source="emotion_log",
            )
        )
