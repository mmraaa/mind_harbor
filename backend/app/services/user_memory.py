"""个性化配置服务：记忆条目、摘要和设置均持久化到规范数据表。"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.adapters import llm, memory_extraction
from app.models.memory import UserMemory, UserMemorySettings
from app.models.session import ChatSession, Message

logger = logging.getLogger(__name__)

MEMORY_TYPES = {"fact", "preference", "project", "context", "boundary"}
MEMORY_CATEGORY_LABELS = {
    "fact": "基本信息",
    "preference": "交流偏好",
    "project": "项目与任务",
    "context": "持续背景",
    "boundary": "交流边界",
}
MANUAL_SOURCE = "user_manual"
AUTO_SOURCE = "chat_auto"
ACTIVE_STATUSES = {"active", "confirmed"}
SENSITIVE_PATTERN = re.compile(
    r"(自杀|自残|自伤|不想活|结束自己|结束生命|轻生|密码|password|api[_ -]?key|token|身份证|银行卡)",
    re.I,
)
SUMMARY_PROMPT = (
    "你是 MindHarbor 的个性化配置整理器。把给定的用户长期配置合并成 2-4 句简洁、"
    "客观、可修正的中文摘要，不做心理诊断，不添加原文没有的推断。"
    "避免使用会过期的相对日期，例如“今天”；应使用“最近”或省略时间。只输出摘要正文。"
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _normalize(value: str) -> str:
    return re.sub(r"\s+", "", value.strip()).lower()


def is_sensitive_content(content: str) -> bool:
    return bool(SENSITIVE_PATTERN.search(content))


def _settings(db: Session, user_id: int, *, create: bool = False) -> UserMemorySettings | None:
    row = db.query(UserMemorySettings).filter_by(user_id=user_id).first()
    if row is None and create:
        row = UserMemorySettings(user_id=user_id, enabled=True)
        db.add(row)
        db.flush()
    return row


def _visible_items(db: Session, user_id: int) -> list[UserMemory]:
    return (
        db.query(UserMemory)
        .filter(UserMemory.user_id == user_id, UserMemory.status.in_(ACTIVE_STATUSES))
        .order_by(UserMemory.importance.desc(), UserMemory.id.desc())
        .all()
    )


def _get_item(db: Session, user_id: int, memory_id: int) -> UserMemory | None:
    return (
        db.query(UserMemory)
        .filter(
            UserMemory.id == memory_id,
            UserMemory.user_id == user_id,
            UserMemory.status.in_(ACTIVE_STATUSES),
        )
        .first()
    )


def memory_enabled(db: Session, user_id: int) -> bool:
    row = _settings(db, user_id)
    return row is None or row.enabled


def set_memory_enabled(db: Session, user_id: int, enabled: bool) -> bool:
    row = _settings(db, user_id, create=True)
    assert row is not None
    row.enabled = bool(enabled)
    db.flush()
    return row.enabled


def _valid_memory_type(value: object) -> str:
    memory_type = str(value or "").strip().lower()
    if memory_type == "goal":
        return "context"
    return memory_type if memory_type in MEMORY_TYPES else "fact"


def _stabilize_auto_content(content: str) -> str:
    """自动记忆不保留会过期的“今天”表述，避免历史事实在次日变得不准确。"""
    return content.replace("今天考试挂科", "最近考试挂科")


def create_manual_memory(db: Session, user_id: int, content: str) -> UserMemory:
    content = content.strip()
    if not content or len(content) > 1000:
        raise ValueError("记忆内容长度应为 1-1000 字")
    if is_sensitive_content(content):
        raise ValueError("请不要在个性化配置中保存自伤信息、密码、密钥或证件号码")
    memory_type = _valid_memory_type(memory_extraction.classify_manual_memory(content))
    for item in _visible_items(db, user_id):
        if _normalize(item.content) == _normalize(content):
            item.memory_type = memory_type
            item.content = content
            item.importance = max(item.importance or 2, 2)
            item.source = MANUAL_SOURCE
            item.confidence = 1.0
            item.status = "confirmed"
            item.user_confirmed = True
            item.last_seen_at = _now()
            db.flush()
            return item
    item = UserMemory(
        user_id=user_id,
        memory_type=memory_type,
        content=content,
        importance=2,
        source=MANUAL_SOURCE,
        confidence=1.0,
        status="confirmed",
        user_confirmed=True,
        evidence_count=1,
        last_seen_at=_now(),
        is_sensitive=False,
    )
    db.add(item)
    db.flush()
    return item


def update_memory(db: Session, user_id: int, memory_id: int, **changes) -> UserMemory:
    item = _get_item(db, user_id, memory_id)
    if item is None:
        raise LookupError("记忆不存在")
    if changes.get("content") is not None:
        content = str(changes["content"]).strip()
        if not content or len(content) > 1000:
            raise ValueError("记忆内容长度应为 1-1000 字")
        if is_sensitive_content(content):
            raise ValueError("请不要在个性化配置中保存自伤信息、密码、密钥或证件号码")
        item.content = content
        item.memory_type = _valid_memory_type(memory_extraction.classify_manual_memory(content))
    item.source = MANUAL_SOURCE
    item.importance = max(item.importance or 2, 2)
    item.confidence = 1.0
    item.status = "confirmed"
    item.user_confirmed = True
    item.last_seen_at = _now()
    db.flush()
    return item


def delete_memory(db: Session, user_id: int, memory_id: int) -> None:
    item = _get_item(db, user_id, memory_id)
    if item is None:
        raise LookupError("记忆不存在")
    item.status = "deleted"
    item.last_seen_at = _now()
    db.flush()


def clear_memories(db: Session, user_id: int) -> int:
    items = _visible_items(db, user_id)
    for item in items:
        item.status = "deleted"
        item.last_seen_at = _now()
    db.flush()
    return len(items)


def _candidate_confidence(candidate: dict) -> float:
    try:
        return max(0.0, min(1.0, float(candidate.get("confidence", 0.7))))
    except (TypeError, ValueError):
        return 0.7


def merge_memory_candidate(
    db: Session,
    user_id: int,
    candidate: dict,
    *,
    source_session_id: int | None = None,
    source_message_id: int | None = None,
) -> UserMemory | None:
    """安全地合并模型候选，并记录可审计的会话来源。"""
    if not isinstance(candidate, dict):
        return None
    memory_type = _valid_memory_type(candidate.get("memory_type"))
    content = _stabilize_auto_content(str(candidate.get("content") or "").strip())
    if not content or len(content) > 500 or is_sensitive_content(content):
        return None
    confidence = _candidate_confidence(candidate)
    if confidence < 0.55:
        return None
    existing = next(
        (item for item in _visible_items(db, user_id) if _normalize(item.content) == _normalize(content)),
        None,
    )
    if existing is not None:
        if not existing.user_confirmed and existing.source_session_id != source_session_id:
            existing.evidence_count = max(existing.evidence_count or 1, 1) + 1
            existing.confidence = max(existing.confidence or 0.0, confidence)
            existing.importance = min(3, max(existing.importance or 1, 2))
        existing.last_seen_at = _now()
        db.flush()
        return existing
    item = UserMemory(
        user_id=user_id,
        memory_type=memory_type,
        content=content,
        importance=3 if confidence >= 0.9 else 2,
        source=AUTO_SOURCE,
        confidence=confidence,
        status="active",
        user_confirmed=False,
        source_session_id=source_session_id,
        source_message_id=source_message_id,
        evidence_count=1,
        last_seen_at=_now(),
        is_sensitive=False,
    )
    db.add(item)
    db.flush()
    return item


def _safe_user_transcript(messages: list[Message]) -> str:
    safe_messages = [
        message.content.strip()
        for message in messages
        if message.role == "user" and message.content and message.content.strip() and not is_sensitive_content(message.content)
    ]
    return "\n".join(f"用户：{content}" for content in safe_messages)


def extract_session_candidates(db: Session, user_id: int, session_id: int) -> int:
    """从一个已结束会话提取安全候选；没有可用内容时不调用模型。"""
    if not memory_enabled(db, user_id):
        return 0
    session = db.query(ChatSession).filter_by(id=session_id, user_id=user_id, status="closed").first()
    if session is None:
        return 0
    messages = db.query(Message).filter_by(session_id=session_id).order_by(Message.id).all()
    transcript = _safe_user_transcript(messages)
    if not transcript:
        return 0
    result = memory_extraction.extract_candidates(
        transcript,
        [
            item.content
            for item in _visible_items(db, user_id)
            if not item.is_sensitive and not is_sensitive_content(item.content)
        ],
    )
    if not isinstance(result, dict) or not isinstance(result.get("candidates"), list):
        return 0
    return sum(
        1
        for candidate in result["candidates"][:5]
        if merge_memory_candidate(db, user_id, candidate, source_session_id=session.id)
    )


def refresh_summary(db: Session, user_id: int) -> str:
    """按当前安全记忆条目刷新用户级摘要。"""
    items = [
        item
        for item in _visible_items(db, user_id)
        if not item.is_sensitive and not is_sensitive_content(item.content)
    ]
    source = "\n".join(f"- {item.content}" for item in items[:30])
    summary = llm.complete_text(SUMMARY_PROMPT, source, temperature=0.2, max_tokens=300).strip() if source else ""
    settings = _settings(db, user_id, create=True)
    assert settings is not None
    settings.summary = summary
    settings.summary_updated_at = _now() if summary else None
    settings.last_consolidated_at = _now()
    db.flush()
    return summary


def generate_baseline_from_closed_sessions(db: Session, user_id: int) -> dict:
    """为已有历史会话建立一次可追溯的个性化配置基线。"""
    settings = _settings(db, user_id, create=True)
    assert settings is not None
    if not settings.enabled:
        return {"analyzed_sessions": [], "created_memories": 0, "accepted_candidates": 0, "summary_updated": False}

    sessions = (
        db.query(ChatSession)
        .filter_by(user_id=user_id, status="closed")
        .order_by(ChatSession.id)
        .all()
    )
    analyzed_sessions: list[int] = []
    created_memories = 0
    accepted_candidates = 0
    known_ids = {item.id for item in _visible_items(db, user_id)}
    for session in sessions:
        messages = db.query(Message).filter_by(session_id=session.id).order_by(Message.id).all()
        if not _safe_user_transcript(messages):
            continue
        try:
            accepted_candidates += extract_session_candidates(db, user_id, session.id)
        except Exception:  # noqa: BLE001 - 一个会话失败不应阻断其他历史会话
            logger.exception("个性化配置基线提取失败(session_id=%s, user_id=%s)", session.id, user_id)
            continue
        analyzed_sessions.append(session.id)
        current_ids = {item.id for item in _visible_items(db, user_id)}
        created_memories += len(current_ids - known_ids)
        known_ids = current_ids
    summary = refresh_summary(db, user_id) if _visible_items(db, user_id) else ""
    settings.last_consolidated_at = _now()
    db.flush()
    return {
        "analyzed_sessions": analyzed_sessions,
        "created_memories": created_memories,
        "accepted_candidates": accepted_candidates,
        "summary_updated": bool(summary),
    }


def _query_terms(value: str | None) -> set[str]:
    if not value:
        return set()
    compact = _normalize(value)
    chinese = "".join(re.findall(r"[\u4e00-\u9fff]", compact))
    terms = {chinese[index : index + 2] for index in range(max(0, len(chinese) - 1))}
    terms.update(token.lower() for token in re.findall(r"[a-zA-Z0-9_]{2,}", compact))
    return terms


def _memory_rank(item: UserMemory, current_terms: set[str]) -> tuple[int, int]:
    overlap = len(current_terms & _query_terms(item.content))
    category_bonus = 50 if item.memory_type == "boundary" else 35 if item.memory_type == "preference" else 0
    return (overlap * 100 + (item.importance or 1) * 10 + category_bonus, item.id)


def memory_context_for_chat(db: Session, user_id: int, current_text: str | None = None) -> str:
    items = [
        item
        for item in _visible_items(db, user_id)
        if not item.is_sensitive and not is_sensitive_content(item.content)
    ]
    current_terms = _query_terms(current_text)
    always_relevant = [item for item in items if item.memory_type in {"boundary", "preference"}]
    ranked = sorted(
        (item for item in items if item not in always_relevant),
        key=lambda item: _memory_rank(item, current_terms),
        reverse=True,
    )
    selected = (always_relevant[:3] + ranked[:6])[:8]
    settings = _settings(db, user_id)
    parts = []
    if settings is not None and settings.summary and not is_sensitive_content(settings.summary):
        parts.append("记忆摘要：" + settings.summary)
    if selected:
        details = "；".join(
            f"{MEMORY_CATEGORY_LABELS.get(item.memory_type, '其他信息')}：{item.content}" for item in selected
        )
        parts.append("个性化配置（仅在相关时自然遵守，不要提及内部记忆）：" + details)
    return "\n".join(parts)


def item_payload(item: UserMemory) -> dict:
    return {
        "id": item.id,
        "memory_type": item.memory_type,
        "category_label": MEMORY_CATEGORY_LABELS.get(item.memory_type, "其他信息"),
        "content": item.content,
        "importance": item.importance,
        "confidence": item.confidence,
        "status": item.status,
        "source": item.source,
        "source_session_id": item.source_session_id,
        "user_confirmed": item.user_confirmed,
        "evidence_count": item.evidence_count,
        "is_sensitive": item.is_sensitive or is_sensitive_content(item.content),
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "updated_at": item.updated_at.isoformat() if item.updated_at else None,
        "expires_at": item.expires_at.isoformat() if item.expires_at else None,
    }


def memory_payload(db: Session, user_id: int) -> dict:
    settings = _settings(db, user_id)
    return {
        "enabled": settings.enabled if settings is not None else True,
        "summary": settings.summary if settings is not None else "",
        "summary_updated_at": settings.summary_updated_at.isoformat()
        if settings is not None and settings.summary_updated_at
        else None,
        "items": [item_payload(item) for item in _visible_items(db, user_id)],
    }


def run_daily_memory_consolidation(db: Session) -> dict:
    """每日整理已开启自动记忆的用户；任一用户失败不影响其余用户。"""
    user_ids = [row[0] for row in db.query(UserMemorySettings.user_id).filter_by(enabled=True).all()]
    result = {"users": len(user_ids), "refreshed": 0, "failed": 0}
    for user_id in user_ids:
        settings = _settings(db, user_id)
        if settings is not None and settings.summary_updated_at is not None:
            stamp = settings.summary_updated_at
            stamp = stamp.replace(tzinfo=timezone.utc) if stamp.tzinfo is None else stamp
            if stamp.date() == _now().date():
                continue
        try:
            if _visible_items(db, user_id):
                refresh_summary(db, user_id)
                db.commit()
                result["refreshed"] += 1
        except Exception:  # noqa: BLE001 - 单个用户失败不阻断批处理
            db.rollback()
            result["failed"] += 1
            logger.exception("每日个性化配置摘要失败(user_id=%s)", user_id)
    return result
