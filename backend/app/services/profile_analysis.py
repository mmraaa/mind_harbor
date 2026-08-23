"""每日读取已结束会话并以小幅、可解释的方式微调基础画像。"""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import date, datetime, timezone

from sqlalchemy.orm import Session

from app.adapters import profile_analysis as analysis_adapter
from app.models.profile import UserProfileAnalysisRun, UserProfileSettings
from app.models.session import ChatSession, Message
from app.services import user_profile

logger = logging.getLogger(__name__)
MAX_DAILY_DELTA = 3
VALID_TRAITS = set(user_profile.BIG_FIVE_DIMENSIONS)
analyze_transcript = analysis_adapter.analyze_transcript


def _validate_analysis(value: object) -> dict:
    if not isinstance(value, dict) or not isinstance(value.get("observations"), list):
        raise ValueError("画像分析结果缺少 observations 数组")
    return value


def _eligible_sessions(db: Session, user_id: int, analyzed: set[int]) -> list[tuple[ChatSession, str]]:
    rows = db.query(ChatSession).filter_by(user_id=user_id, status="closed").order_by(ChatSession.id).all()
    result = []
    for session in rows:
        if session.id in analyzed:
            continue
        messages = db.query(Message).filter_by(session_id=session.id, role="user").order_by(Message.id).all()
        text = "\n".join(message.content.strip() for message in messages if message.content and message.content.strip())
        if not text or user_profile._CRISIS.search(text) or user_profile._EXCLUDED_PROFILE_CONTENT.search(text):
            continue
        transcript = "\n".join(f"用户：{message.content}" for message in messages if message.content.strip())
        result.append((session, transcript))
    return result


def _merge_result(db: Session, user_id: int, analyses: list[dict]) -> bool:
    current = user_profile._current(db, user_id)
    if current is None or current.content.get("questionnaire_version") != user_profile.QUESTIONNAIRE_VERSION:
        return False
    content = dict(current.content)
    big_five = {key: dict(value) for key, value in (content.get("big_five") or {}).items()}
    traits = {key: dict(value) for key, value in (content.get("traits") or {}).items()}
    notes = list(content.get("ai_analysis_notes") or [])
    changed = False
    applied_dimensions: set[str] = set()
    for analysis in analyses:
        note = str(analysis.get("overall_note") or "").strip()
        evidence_items = []
        for item in analysis.get("observations", []):
            if not isinstance(item, dict) or item.get("trait_key") not in VALID_TRAITS:
                continue
            direction = item.get("direction")
            if direction not in {"increase", "decrease"}:
                continue
            dimension = big_five.get(item["trait_key"])
            if not dimension or not isinstance(dimension.get("score"), (int, float)):
                continue
            if item["trait_key"] in applied_dimensions:
                continue
            evidence_items.append({
                "trait_key": item["trait_key"],
                "direction": direction,
                "evidence": str(item.get("evidence") or "")[:100],
            })
            sign = 1 if direction == "increase" else -1
            score = int(dimension["score"])
            new_score = max(0, min(100, score + MAX_DAILY_DELTA * sign))
            if new_score == score:
                continue
            level = "偏低" if new_score < 40 else "偏高" if new_score >= 67 else "中等"
            dimension.update({"score": new_score, "level": level, "description": user_profile._dimension_description(item["trait_key"], level)})
            if item["trait_key"] in traits:
                traits[item["trait_key"]].update({"score": new_score, "option": str(new_score), "level": level, "value": level, "source": "ai_behavior"})
            changed = True
            applied_dimensions.add(item["trait_key"])
        if note or evidence_items:
            notes.append({
                "note": note[:200],
                "observations": evidence_items,
                "generated_at": datetime.now(timezone.utc).isoformat(),
            })
    if not changed and not notes:
        return False
    refreshed = user_profile._content(
        traits,
        content.get("observations") or [],
        big_five=big_five,
        evidence_count=int(content.get("evidence_count") or 0),
        questionnaire_version=content.get("questionnaire_version", user_profile.QUESTIONNAIRE_VERSION),
        questionnaire_answers=content.get("questionnaire_answers") or {},
    )
    refreshed.update({"ai_analysis_notes": notes[-20:], "model_version": "big-five-cn-v1+qwen-daily"})
    user_profile._save_snapshot(db, user_id, "ai_behavior", refreshed)
    return True


def run_daily_profile_analysis(db: Session, *, today: date | None = None) -> dict:
    """运行一次全体学生的每日分析；重复执行同一日期不会重复分析会话。"""
    analysis_date = today or datetime.now(timezone.utc).date()
    summary = {"date": analysis_date.isoformat(), "users": 0, "analyzed_sessions": [], "failed_sessions": []}
    # 兼容已存在的本机/团队数据库：新表缺失时按需创建，不阻塞 API 启动。
    UserProfileAnalysisRun.__table__.create(bind=db.get_bind(), checkfirst=True)
    settings_rows = db.query(UserProfileSettings).filter_by(enabled=True).all()
    for settings in settings_rows:
        current = user_profile._current(db, settings.user_id)
        if not current or current.content.get("questionnaire_version") != user_profile.QUESTIONNAIRE_VERSION:
            continue
        run = db.query(UserProfileAnalysisRun).filter_by(user_id=settings.user_id, analysis_date=analysis_date).first()
        prior_runs = db.query(UserProfileAnalysisRun).filter_by(user_id=settings.user_id).all()
        analyzed = {session_id for item in prior_runs for session_id in (item.session_ids or [])}
        candidates = _eligible_sessions(db, settings.user_id, analyzed)
        if not candidates and run is not None:
            continue
        if run is None:
            run = UserProfileAnalysisRun(user_id=settings.user_id, analysis_date=analysis_date, session_ids=[], result={}, status="running")
            db.add(run)
            db.flush()
        analyses = []
        user_failures = []
        for session, transcript in candidates:
            try:
                analyses.append(_validate_analysis(analyze_transcript(transcript)))
                run.session_ids = list(run.session_ids or []) + [session.id]
                summary["analyzed_sessions"].append(session.id)
            except Exception as exc:  # noqa: BLE001
                logger.warning("每日画像分析失败(user_id=%s, session_id=%s): %s", settings.user_id, session.id, exc)
                user_failures.append(session.id)
                summary["failed_sessions"].append(session.id)
        if analyses:
            _merge_result(db, settings.user_id, analyses)
        run.result = {"analyzed": len(analyses), "failed": len(user_failures)}
        run.status = "failed" if user_failures else "succeeded"
        run.input_hash = hashlib.sha256(json.dumps(run.session_ids or [], sort_keys=True).encode()).hexdigest()
        summary["users"] += 1
    db.commit()
    return summary
