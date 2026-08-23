from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.database import get_db
from app.models.user import User
from app.ai import profile as legacy_profile
from app.schemas.profile import ProfileConsentUpdate, ProfileQuestionnaireSubmit, ProfileSelfEdit
from app.services import user_profile

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("")
def get_profile_legacy(user: User = Depends(require_roles("student")), db: Session = Depends(get_db)) -> dict:
    return legacy_profile.profile_payload(db, user.id)


@router.get("/test/questions")
def profile_test_questions(user: User = Depends(require_roles("student"))) -> list[dict]:
    return legacy_profile.LEGACY_QUESTIONS


@router.get("/questionnaire/questions")
def profile_questionnaire_questions(user: User = Depends(require_roles("student"))) -> dict:
    """返回当前版本的 30 题五级量表，避免前端硬编码题库。"""
    return {
        "version": user_profile.QUESTIONNAIRE_VERSION,
        "scale": [
            {"value": value, "label": label}
            for value, label in user_profile.LIKERT_OPTIONS
        ],
        "dimensions": [
            {"key": key, "label": user_profile.BIG_FIVE_LABELS[key]}
            for key in user_profile.BIG_FIVE_DIMENSIONS
        ],
        "questions": user_profile.PROFILE_QUESTIONS,
    }


@router.post("/test")
def profile_test_legacy(
    body: dict,
    user: User = Depends(require_roles("student")),
    db: Session = Depends(get_db),
) -> dict:
    answers = body.get("answers") if isinstance(body.get("answers"), dict) else body
    try:
        return legacy_profile.submit_test(db, user.id, answers)
    except user_profile.ProfileBaselineAlreadyExists as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc


@router.patch("/manual")
def profile_manual_legacy(
    body: dict,
    user: User = Depends(require_roles("student")),
    db: Session = Depends(get_db),
) -> dict:
    items = body.get("items") if isinstance(body.get("items"), list) else []
    updates: dict[str, str] = {}
    for item in items:
        if isinstance(item, dict) and isinstance(item.get("key"), str) and isinstance(item.get("value"), str):
            value = {"listening_first": "listen_first", "actionable_steps": "direct_steps"}.get(item["value"], item["value"])
            updates[item["key"]] = value
    try:
        if user_profile._current(db, user.id) is None:
            legacy_profile.submit_test(db, user.id, {})
        settings = user_profile.get_settings(db, user.id)
        # 旧契约以 last_manual_edit_at 为准；同步到新字段后复用统一节流逻辑。
        if settings.last_manual_edit_at is not None:
            settings.last_self_edit_at = settings.last_manual_edit_at
        result = user_profile.self_edit(db, user.id, updates)
        return {**legacy_profile.profile_payload(db, user.id), "next_manual_edit_at": result["next_self_edit_at"]}
    except user_profile.ProfileEditRateLimited as exc:
        next_at = (user_profile.get_settings(db, user.id).last_self_edit_at or user_profile.get_settings(db, user.id).last_manual_edit_at)
        next_value = (next_at + user_profile.EDIT_INTERVAL).isoformat() if next_at else None
        return JSONResponse(status_code=status.HTTP_429_TOO_MANY_REQUESTS, content={"detail": str(exc), "next_manual_edit_at": next_value})
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc


@router.get("/mine")
def get_my_profile(user: User = Depends(require_roles("student")), db: Session = Depends(get_db)) -> dict:
    return user_profile.get_profile(db, user.id)


@router.post("/consent")
def update_profile_consent(
    body: ProfileConsentUpdate,
    user: User = Depends(require_roles("student")),
    db: Session = Depends(get_db),
) -> dict:
    return user_profile.set_consent(db, user.id, body.enabled)


@router.post("/questionnaire")
def submit_profile_questionnaire(
    body: ProfileQuestionnaireSubmit,
    user: User = Depends(require_roles("student")),
    db: Session = Depends(get_db),
) -> dict:
    try:
        return user_profile.submit_questionnaire(db, user.id, body.answers)
    except user_profile.ProfileBaselineAlreadyExists as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc


@router.patch("/self-edit")
def edit_my_profile(
    body: ProfileSelfEdit,
    user: User = Depends(require_roles("student")),
    db: Session = Depends(get_db),
) -> dict:
    try:
        return user_profile.self_edit(db, user.id, body.updates)
    except user_profile.ProfileEditRateLimited as exc:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc


@router.delete("/mine", status_code=status.HTTP_204_NO_CONTENT)
def delete_my_profile(user: User = Depends(require_roles("student")), db: Session = Depends(get_db)) -> None:
    user_profile.delete_profile(db, user.id)
