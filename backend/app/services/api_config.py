"""模型服务配置解析、密钥加密和用量记录。"""

from __future__ import annotations

import base64
import hashlib
from dataclasses import dataclass

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy.orm import Session

from app.admin_module.models import ApiServiceConfig
from app.core.config import get_settings
from app.core.database import SessionLocal


SERVICE_META = {
    "llm": ("对话模型", "llm_api_key", "llm_base_url", "llm_model"),
    "embedding": ("向量模型", "embedding_api_key", "embedding_base_url", "embedding_model"),
    "tts": ("语音陪伴", "tts_api_key", "tts_base_url", "tts_model"),
}


@dataclass(frozen=True)
class ResolvedService:
    service_id: str
    label: str
    enabled: bool
    api_key: str
    base_url: str
    model: str
    timeout_seconds: int = 120
    max_tokens: int | None = None
    context_window: int | None = None
    token_budget: int | None = None
    fallback: "ResolvedService | None" = None


def _fernet() -> Fernet:
    secret = get_settings().jwt_secret.encode("utf-8")
    key = base64.urlsafe_b64encode(hashlib.sha256(secret).digest())
    return Fernet(key)


def encrypt_secret(value: str) -> str:
    return _fernet().encrypt(value.encode("utf-8")).decode("ascii")


def decrypt_secret(value: str | None) -> str:
    if not value:
        return ""
    try:
        return _fernet().decrypt(value.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError):
        return ""


def mask_secret(value: str | None) -> str | None:
    if not value:
        return None
    if len(value) <= 8:
        return "*" * len(value)
    return f"{value[:4]}****{value[-4:]}"


def _env_service(service_id: str) -> ResolvedService:
    settings = get_settings()
    label, key_name, url_name, model_name = SERVICE_META[service_id]
    return ResolvedService(
        service_id=service_id,
        label=label,
        enabled=True,
        api_key=getattr(settings, key_name) or "",
        base_url=getattr(settings, url_name) or "",
        model=getattr(settings, model_name) or "",
    )


def _from_row(row: ApiServiceConfig) -> ResolvedService:
    fallback = None
    if row.fallback_enabled:
        fallback = ResolvedService(
            service_id=f"{row.service_id}:fallback",
            label=f"{row.label}备用",
            enabled=True,
            api_key=decrypt_secret(row.fallback_api_key_encrypted),
            base_url=row.fallback_base_url or "",
            model=row.fallback_model or "",
            timeout_seconds=row.timeout_seconds,
            max_tokens=row.max_tokens,
            context_window=row.context_window,
        )
    return ResolvedService(
        service_id=row.service_id,
        label=row.label,
        enabled=row.enabled,
        api_key=decrypt_secret(row.api_key_encrypted),
        base_url=row.base_url or "",
        model=row.model or "",
        timeout_seconds=row.timeout_seconds,
        max_tokens=row.max_tokens,
        context_window=row.context_window,
        token_budget=row.token_budget,
        fallback=fallback,
    )


def resolve_service(service_id: str) -> ResolvedService:
    """优先读取本地管理员配置，表不存在/不可用时安全回退到环境变量。"""
    fallback = _env_service(service_id)
    try:
        db = SessionLocal()
        try:
            row = db.get(ApiServiceConfig, service_id)
            if row is None:
                return fallback
            return _from_row(row)
        finally:
            db.close()
    except Exception:  # noqa: BLE001 - 配置读取失败不能阻断环境变量 fallback
        return fallback


def ensure_rows(db: Session) -> None:
    """为既有数据库补建表和默认配置行，不覆盖环境变量中的密钥。"""
    ApiServiceConfig.__table__.create(db.get_bind(), checkfirst=True)
    settings = get_settings()
    for service_id, (label, key_name, url_name, model_name) in SERVICE_META.items():
        if db.get(ApiServiceConfig, service_id) is None:
            db.add(ApiServiceConfig(
                service_id=service_id,
                label=label,
                base_url=getattr(settings, url_name) or None,
                model=getattr(settings, model_name) or None,
                api_key_encrypted=encrypt_secret(getattr(settings, key_name)) if getattr(settings, key_name) else None,
            ))
    db.commit()


def record_usage(service_id: str, *, prompt_tokens: int = 0, completion_tokens: int = 0, failed: bool = False) -> None:
    try:
        db = SessionLocal()
        try:
            row = db.get(ApiServiceConfig, service_id)
            if row is None:
                return
            row.prompt_tokens += max(0, prompt_tokens)
            row.completion_tokens += max(0, completion_tokens)
            row.total_tokens += max(0, prompt_tokens) + max(0, completion_tokens)
            row.request_count += 1
            if failed:
                row.failure_count += 1
            db.commit()
        finally:
            db.close()
    except Exception:  # noqa: BLE001 - 统计失败不应让用户请求失败
        return
