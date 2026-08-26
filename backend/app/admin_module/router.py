import httpx

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.admin_module.models import AccountControl, ApiServiceConfig
from app.admin_module import sync as sync_module
from app.adapters.doodle_review import (
    connection_status,
    doodle_generation_url,
    doodle_validation_payload,
    response_usage_tokens,
    text_probe_status,
    validation_response_ok,
)
from app.adapters.profile_analysis import (
    profile_response_usage_tokens,
    profile_validation_payload,
    profile_validation_response_ok,
)
from app.admin_module.schemas import (
    ApiServiceConfigUpdate,
    CounselorCreate,
    CounselorUpdate,
    ResourceCreate,
    ResourceUpdate,
    StudentUpdate,
)
from app.api.deps import require_roles
from app.core.database import get_db
from app.core.security import hash_password
from app.models.resource import Resource
from app.models.user import Counselor, User
from app.services.api_config import (
    SERVICE_META,
    decrypt_secret,
    ensure_rows,
    encrypt_secret,
    mask_secret,
    record_usage,
)

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(require_roles("admin"))],
)


def _control(db: Session, user_id: int, *, create: bool = True) -> AccountControl | None:
    row = db.query(AccountControl).filter_by(user_id=user_id).first()
    if row is None and create:
        row = AccountControl(user_id=user_id)
        db.add(row)
        db.flush()
    return row


def _counselor_payload(db: Session, user: User, profile: Counselor) -> dict:
    control = _control(db, user.id)
    return {
        "id": profile.id,
        "user_id": user.id,
        "username": user.username,
        "role": user.role,
        "name": user.name,
        "title": profile.title,
        "specialty": profile.specialty,
        "bio": profile.bio,
        "availability": control.availability if control else "",
        "is_enabled": control.is_enabled if control else True,
    }


def _student_payload(db: Session, user: User) -> dict:
    control = _control(db, user.id)
    return {
        "id": user.id,
        "username": user.username,
        "display_username": user.display_username or user.name or user.username,
        "role": user.role,
        "name": user.name,
        "risk_tags": list(control.risk_tags or []) if control else [],
        "is_enabled": control.is_enabled if control else True,
    }


def _sync_or_502(operation, *args) -> None:
    try:
        operation(*args)
    except sync_module.LanSyncError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "局域网数据库同步失败，请检查连接") from exc


@router.get("/overview")
def admin_overview(db: Session = Depends(get_db)) -> dict:
    """管理员运营概览:只返回数量和账号状态,不暴露心理内容。"""
    return {
        "students": db.query(User).filter(User.role == "student").count(),
        "counselors": db.query(User).filter(User.role == "counselor").count(),
        "resources": db.query(Resource).count(),
        "active_resources": db.query(Resource).filter(Resource.is_active.is_(True)).count(),
        "enabled_accounts": db.query(AccountControl).filter(AccountControl.is_enabled.is_(True)).count(),
        "disabled_accounts": db.query(AccountControl).filter(AccountControl.is_enabled.is_(False)).count(),
    }


@router.get("/api-status")
def admin_api_status() -> dict:
    """返回模型和同步服务的脱敏状态,不会返回任何密钥。"""
    return sync_module.service_status()


def _api_config_payload(row: ApiServiceConfig) -> dict:
    primary_secret = decrypt_secret(row.api_key_encrypted)
    fallback_secret = decrypt_secret(row.fallback_api_key_encrypted)
    return {
        "service_id": row.service_id,
        "label": row.label,
        "enabled": row.enabled,
        "base_url": row.base_url,
        "model": row.model,
        "api_key_configured": bool(primary_secret),
        "api_key_masked": mask_secret(primary_secret),
        "context_window": row.context_window,
        "max_tokens": row.max_tokens,
        "timeout_seconds": row.timeout_seconds,
        "token_budget": row.token_budget,
        "usage": {
            "prompt_tokens": row.prompt_tokens,
            "completion_tokens": row.completion_tokens,
            "total_tokens": row.total_tokens,
            "request_count": row.request_count,
            "failure_count": row.failure_count,
            "remaining_tokens": max(0, row.token_budget - row.total_tokens) if row.token_budget is not None else None,
        },
        "fallback": {
            "enabled": row.fallback_enabled,
            "base_url": row.fallback_base_url,
            "model": row.fallback_model,
            "api_key_configured": bool(fallback_secret),
            "api_key_masked": mask_secret(fallback_secret),
        },
    }


@router.get("/api-configs")
def list_api_configs(db: Session = Depends(get_db)) -> dict:
    """列出管理员可管理的模型服务；永不返回密钥原文。"""
    ensure_rows(db)
    rows = (
        db.query(ApiServiceConfig)
        .order_by(ApiServiceConfig.service_id)
        .all()
    )
    return {"services": [_api_config_payload(row) for row in rows]}


def _connection_status(status_code: int, *, contract_probe: bool = False) -> str:
    """把供应商探测结果转换为管理端可读状态。"""
    return connection_status(status_code, contract_probe=contract_probe)


@router.patch("/api-configs/{service_id}")
def update_api_config(
    service_id: str,
    body: ApiServiceConfigUpdate,
    db: Session = Depends(get_db),
) -> dict:
    """更新主/备用 API 服务配置；空密钥表示保持原值。"""
    if service_id not in SERVICE_META:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "API 服务不存在")
    ensure_rows(db)
    row = db.get(ApiServiceConfig, service_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "API 服务不存在")

    values = body.model_dump(exclude_unset=True, exclude={"api_key", "fallback"})
    for field, value in values.items():
        setattr(row, field, value)
    if body.api_key and body.api_key.strip():
        row.api_key_encrypted = encrypt_secret(body.api_key.strip())
    if body.fallback is not None:
        fallback = body.fallback
        row.fallback_enabled = fallback.enabled
        if fallback.base_url is not None:
            row.fallback_base_url = fallback.base_url or None
        if fallback.model is not None:
            row.fallback_model = fallback.model or None
        if fallback.api_key and fallback.api_key.strip():
            row.fallback_api_key_encrypted = encrypt_secret(fallback.api_key.strip())

    db.commit()
    db.refresh(row)
    return _api_config_payload(row)


@router.post("/api-configs/{service_id}/usage/reset")
def reset_api_usage(service_id: str, db: Session = Depends(get_db)) -> dict:
    """Clear one service's accumulated usage after an administrator confirms a new baseline."""
    if service_id not in SERVICE_META:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "API 服务不存在")
    ensure_rows(db)
    row = db.get(ApiServiceConfig, service_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "API 服务不存在")
    row.prompt_tokens = 0
    row.completion_tokens = 0
    row.total_tokens = 0
    row.request_count = 0
    row.failure_count = 0
    db.commit()
    db.refresh(row)
    return _api_config_payload(row)


@router.post("/api-configs/{service_id}/test")
def test_api_config(service_id: str, db: Session = Depends(get_db)) -> dict:
    """Probe each managed service and count exactly one administrator request."""
    if service_id not in SERVICE_META:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "API 服务不存在")
    ensure_rows(db)
    row = db.get(ApiServiceConfig, service_id)
    if row is None or not row.enabled or not row.base_url:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "请先启用并填写基础地址")
    api_key = decrypt_secret(row.api_key_encrypted)
    if not api_key:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "请先配置 API Key")
    try:
        probe_url = row.base_url.rstrip("/")
        # 画像和画作审核都必须走一次真实推理，避免把 /models 可达误报为模型可用。
        if service_id == "profile_analysis":
            response = httpx.post(
                probe_url + "/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json=profile_validation_payload(row.model),
                timeout=min(max(row.timeout_seconds, 1), 30),
                trust_env=False,
            )
        elif service_id != "doodle_review":
            probe_url += "/models"
            response = httpx.get(
                probe_url,
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=min(max(row.timeout_seconds, 1), 10),
                trust_env=False,
            )
        else:
            probe_url = doodle_generation_url(probe_url)
            response = httpx.post(
                probe_url,
                headers={"Authorization": f"Bearer {api_key}"},
                json=doodle_validation_payload(row.model),
                timeout=min(max(row.timeout_seconds, 1), 10),
                trust_env=False,
            )
    except httpx.HTTPError:
        record_usage(service_id, failed=True, db=db)
        return {
            "service_id": service_id,
            "status": "unreachable",
            "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
        }
    if service_id == "profile_analysis":
        prompt_tokens, completion_tokens = profile_response_usage_tokens(response)
        probe_status = "verified" if profile_validation_response_ok(response) else (
            _connection_status(response.status_code) if not 200 <= response.status_code < 300 else "invalid"
        )
        record_usage(
            service_id,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            failed=probe_status != "verified",
            db=db,
        )
        return {
            "service_id": service_id,
            "status": probe_status,
            "usage": {
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": prompt_tokens + completion_tokens,
            },
        }
    if service_id == "doodle_review":
        probe_status = text_probe_status(response)
        prompt_tokens, completion_tokens = response_usage_tokens(response)
        record_usage(
            service_id,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            failed=probe_status != "reachable",
            db=db,
        )
        return {
            "service_id": service_id,
            "status": probe_status,
            "usage": {
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": prompt_tokens + completion_tokens,
            },
        }
    probe_status = _connection_status(response.status_code)
    record_usage(service_id, failed=probe_status != "reachable", db=db)
    return {
        "service_id": service_id,
        "status": probe_status,
        "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
    }


@router.post("/api-configs/{service_id}/validate")
def validate_api_config(service_id: str, db: Session = Depends(get_db)) -> dict:
    """Run an explicit, minimal inference check for the native doodle-review model."""
    if service_id != "doodle_review":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "当前仅支持验证画作审核模型")
    ensure_rows(db)
    row = db.get(ApiServiceConfig, service_id)
    if row is None or not row.enabled or not row.base_url or not row.model:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "请先启用并填写基础地址和模型")
    api_key = decrypt_secret(row.api_key_encrypted)
    if not api_key:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "请先配置 API Key")
    try:
        response = httpx.post(
            doodle_generation_url(row.base_url),
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=doodle_validation_payload(row.model),
            timeout=min(max(row.timeout_seconds, 1), 30),
            trust_env=False,
        )
    except httpx.HTTPError:
        record_usage(service_id, failed=True, db=db)
        return {"service_id": service_id, "status": "unreachable"}

    if not 200 <= response.status_code < 300:
        record_usage(service_id, failed=True, db=db)
        return {"service_id": service_id, "status": _connection_status(response.status_code)}
    if not validation_response_ok(response):
        record_usage(service_id, failed=True, db=db)
        return {"service_id": service_id, "status": "invalid"}
    prompt_tokens, completion_tokens = response_usage_tokens(response)
    record_usage(
        service_id,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        db=db,
    )
    return {
        "service_id": service_id,
        "status": "verified",
        "usage": {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": prompt_tokens + completion_tokens,
        },
    }


@router.get("/counselors")
def list_counselors(
    keyword: str | None = Query(default=None, max_length=64),
    db: Session = Depends(get_db),
) -> dict:
    query = (
        db.query(User, Counselor)
        .join(Counselor, Counselor.user_id == User.id)
        .filter(User.role == "counselor")
    )
    if keyword and keyword.strip():
        pattern = f"%{keyword.strip()}%"
        query = query.filter(
            User.name.ilike(pattern)
            | User.username.ilike(pattern)
            | User.display_username.ilike(pattern)
        )
    rows = query.order_by(User.id).all()
    return {"total": len(rows), "items": [_counselor_payload(db, user, profile) for user, profile in rows]}


@router.post("/counselors", status_code=status.HTTP_201_CREATED)
def create_counselor(body: CounselorCreate, db: Session = Depends(get_db)) -> dict:
    if db.query(User).filter_by(username=body.username).first() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "用户名已被使用")
    user = User(
        role="counselor",
        username=body.username,
        name=body.name,
        password_hash=hash_password(body.password),
    )
    db.add(user)
    db.flush()
    profile = Counselor(
        user_id=user.id,
        title=body.title,
        specialty=body.specialty,
        bio=body.bio,
    )
    db.add(profile)
    control = AccountControl(user_id=user.id, availability=body.availability)
    db.add(control)
    db.commit()
    db.refresh(user)
    db.refresh(profile)
    _sync_or_502(sync_module.sync_counselor, user, profile, control)
    return _counselor_payload(db, user, profile)


@router.patch("/counselors/{user_id}")
def update_counselor(user_id: int, body: CounselorUpdate, db: Session = Depends(get_db)) -> dict:
    user = db.get(User, user_id)
    profile = db.query(Counselor).filter_by(user_id=user_id).first()
    if user is None or profile is None or user.role != "counselor":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "咨询师不存在")
    values = body.model_dump(exclude_unset=True)
    if "name" in values:
        user.name = values.pop("name")
    if "password" in values:
        user.password_hash = hash_password(values.pop("password"))
    is_enabled = values.pop("is_enabled", None)
    availability = values.pop("availability", None)
    for field, value in values.items():
        setattr(profile, field, value)
    control = _control(db, user.id)
    if is_enabled is not None:
        control.is_enabled = is_enabled
    if availability is not None:
        control.availability = availability
    db.commit()
    db.refresh(user)
    db.refresh(profile)
    db.refresh(control)
    _sync_or_502(sync_module.sync_counselor, user, profile, control)
    return _counselor_payload(db, user, profile)


@router.get("/students")
def list_students(
    keyword: str | None = Query(default=None, max_length=64),
    db: Session = Depends(get_db),
) -> dict:
    query = db.query(User).filter(User.role == "student")
    if keyword and keyword.strip():
        pattern = f"%{keyword.strip()}%"
        query = query.filter(User.name.ilike(pattern) | User.username.ilike(pattern))
    rows = query.order_by(User.id).all()
    return {"total": len(rows), "items": [_student_payload(db, user) for user in rows]}


@router.patch("/students/{user_id}")
def update_student(user_id: int, body: StudentUpdate, db: Session = Depends(get_db)) -> dict:
    user = db.get(User, user_id)
    if user is None or user.role != "student":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "学生不存在")
    values = body.model_dump(exclude_unset=True)
    if "name" in values:
        user.name = values.pop("name")
    control = _control(db, user.id)
    if "risk_tags" in values:
        control.risk_tags = values.pop("risk_tags")
    if "is_enabled" in values:
        control.is_enabled = values.pop("is_enabled")
    db.commit()
    db.refresh(user)
    db.refresh(control)
    _sync_or_502(sync_module.sync_student, user, control)
    return _student_payload(db, user)


@router.get("/resources")
def list_resources(
    keyword: str | None = Query(default=None, max_length=128),
    db: Session = Depends(get_db),
) -> dict:
    query = db.query(Resource)
    if keyword and keyword.strip():
        pattern = f"%{keyword.strip()}%"
        query = query.filter(Resource.title.ilike(pattern) | Resource.content.ilike(pattern))
    rows = query.order_by(Resource.id.desc()).all()
    return {
        "total": len(rows),
        "items": [
            {
                "id": resource.id,
                "title": resource.title,
                "type": resource.type,
                "content": resource.content,
                "url": resource.url,
                "is_active": resource.is_active,
            }
            for resource in rows
        ],
    }


@router.post("/resources", status_code=status.HTTP_201_CREATED)
def create_resource(body: ResourceCreate, db: Session = Depends(get_db)) -> dict:
    resource = Resource(**body.model_dump())
    db.add(resource)
    db.commit()
    db.refresh(resource)
    _sync_or_502(sync_module.sync_resource, resource)
    return {
        "id": resource.id,
        "title": resource.title,
        "type": resource.type,
        "content": resource.content,
        "url": resource.url,
        "is_active": resource.is_active,
    }


@router.patch("/resources/{resource_id}")
def update_resource(resource_id: int, body: ResourceUpdate, db: Session = Depends(get_db)) -> dict:
    resource = db.get(Resource, resource_id)
    if resource is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "资源不存在")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(resource, field, value)
    db.commit()
    db.refresh(resource)
    _sync_or_502(sync_module.sync_resource, resource)
    return {
        "id": resource.id,
        "title": resource.title,
        "type": resource.type,
        "content": resource.content,
        "url": resource.url,
        "is_active": resource.is_active,
    }


@router.delete("/resources/{resource_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_resource(resource_id: int, db: Session = Depends(get_db)) -> None:
    resource = db.get(Resource, resource_id)
    if resource is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "资源不存在")
    db.delete(resource)
    db.commit()
    _sync_or_502(sync_module.delete_resource, resource_id)
