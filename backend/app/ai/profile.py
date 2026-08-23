"""团队画像旧契约适配层。

新代码使用 ``app.services.user_profile``；本模块保留旧测试和旧前端所需的
八题问卷、/profile/test 和按消息聚合的观察接口。
"""

from sqlalchemy.orm import Session

from app.models.profile import ProfileObservation, ProfileSettings
from app.services import user_profile

LEGACY_QUESTIONS = [
    {"key": "q1", "label": "你希望助手先听你说，还是直接给建议？", "options": ["listening_first", "actionable_steps"]},
    {"key": "q2", "label": "面对压力时，什么陪伴方式更合适？", "options": ["listening_first", "actionable_steps"]},
    {"key": "q3", "label": "你更喜欢怎样开始解决问题？", "options": ["actionable_steps", "listening_first"]},
    {"key": "q4", "label": "你更愿意怎样整理感受？", "options": ["gentle_reflection", "structured_reflection"]},
    {"key": "q5", "label": "你希望对话节奏怎样？", "options": ["gentle_reflection", "structured_reflection"]},
    {"key": "q6", "label": "哪类自助方式更容易开始？", "options": ["guided_practice", "structured_reflection"]},
    {"key": "q7", "label": "需要稳定下来时，你更愿意？", "options": ["guided_practice", "gentle_reflection"]},
    {"key": "q8", "label": "你喜欢怎样回顾一次对话？", "options": ["structured_reflection", "gentle_reflection"]},
]


def _legacy_items(db: Session, user_id: int) -> list[dict]:
    snapshot = user_profile._current(db, user_id)
    if snapshot is None:
        return []
    items = []
    for key, trait in (snapshot.content.get("traits") or {}).items():
        items.append({
            "key": key,
            "value": trait.get("option", ""),
            "label": trait.get("value", ""),
            "source": "test" if snapshot.source == "test" else trait.get("source", snapshot.source),
            "status": "stable",
        })
    return items


def profile_payload(db: Session, user_id: int) -> dict:
    settings = user_profile.get_settings(db, user_id)
    return {"enabled": settings.enabled, "test_completed": settings.questionnaire_completed_at is not None, "items": _legacy_items(db, user_id)}


def _map_answers(answers: dict[str, str]) -> dict[str, str]:
    support = "direct_steps" if any(answers.get(key) == "actionable_steps" for key in ("q3",)) else "listen_first"
    coping = "body_practice" if any(answers.get(key) == "guided_practice" for key in ("q6", "q7")) else "writing"
    social = "trusted_person"
    return {"support_style": support, "coping_style": coping, "social_support": social}


def submit_test(db: Session, user_id: int, answers: dict[str, str]) -> dict:
    settings = user_profile.get_settings(db, user_id)
    if not settings.enabled:
        raise ValueError("请先开启画像授权")
    if settings.questionnaire_completed_at is not None and user_profile._current(db, user_id) is not None:
        raise user_profile.ProfileBaselineAlreadyExists("基础画像已经建立，请使用自助修改入口")
    mapped = _map_answers(answers)
    # 复用确定性问卷计算，只将来源标记为团队旧契约的 test。
    traits = {}
    for key, option in mapped.items():
        traits[key] = {
            "label": {"support_style": "陪伴方式", "coping_style": "调节方式", "social_support": "支持来源"}[key],
            "value": user_profile.QUESTIONNAIRE_OPTIONS[key][option],
            "option": option,
            "source": "test",
            "confidence": 0.6,
        }
    settings.questionnaire_completed_at = user_profile._now()
    snapshot = user_profile._save_snapshot(
        db,
        user_id,
        "test",
        user_profile._content(traits, questionnaire_version="legacy-v1"),
    )
    db.commit()
    return profile_payload(db, user_id)


def observe_message(db: Session, user_id: int, session_id: int, message_id: int, content: str) -> list[dict]:
    settings = user_profile.get_settings(db, user_id)
    if not settings.enabled or user_profile._CRISIS.search(content):
        return []
    match = user_profile._extract_observation(content)
    if match is None:
        return []
    trait_key, value, evidence = match
    row = db.query(ProfileObservation).filter_by(user_id=user_id, trait_key=trait_key, value=value).first()
    if row is None:
        row = ProfileObservation(
            user_id=user_id,
            session_id=session_id,
            trait_key=trait_key,
            value=value,
            status="candidate",
            confidence=0.4,
            evidence_count=1,
            evidence=evidence,
        )
        db.add(row)
    else:
        row.evidence_count += 1
        row.status = "stable" if row.evidence_count >= 2 else row.status
        row.confidence = 0.75 if row.status == "stable" else row.confidence
    db.flush()
    return [{"key": trait_key, "value": value, "status": row.status, "evidence_count": row.evidence_count}]
