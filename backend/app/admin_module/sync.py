"""管理员写操作的局域网 PostgreSQL 镜像同步。"""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
from typing import Callable

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.admin_module.models import AccountControl
from app.core.config import get_settings
from app.core.schema import ensure_user_account_schema
from app.models.resource import Resource
from app.models.user import Counselor, User
from app.services.api_config import resolve_service

logger = logging.getLogger(__name__)


class LanSyncError(RuntimeError):
    """局域网镜像不可用或写入失败。"""


def sync_enabled() -> bool:
    settings = get_settings()
    return bool(
        settings.sync_enabled
        and settings.sync_postgres_host
        and settings.sync_postgres_db
        and settings.sync_postgres_user
    )


@lru_cache(maxsize=1)
def _sync_session_factory() -> sessionmaker:
    settings = get_settings()
    engine = create_engine(settings.sync_database_url, pool_pre_ping=True, connect_args={"connect_timeout": 5})
    return sessionmaker(bind=engine, autocommit=False, autoflush=False)


def _with_remote(operation: Callable[[Session], None]) -> None:
    if not sync_enabled():
        return
    session = _sync_session_factory()()
    try:
        # 该表是本项目新增的运营字段,远程团队库可能尚未迁移。
        AccountControl.__table__.create(session.get_bind(), checkfirst=True)
        ensure_user_account_schema(session.get_bind())
        operation(session)
        session.commit()
    except Exception as exc:  # noqa: BLE001
        session.rollback()
        logger.exception("LAN database sync failed")
        raise LanSyncError(str(exc)) from exc
    finally:
        session.close()


def _upsert_user(session: Session, user: User) -> User:
    remote = session.get(User, user.id)
    if remote is None:
        remote = User(
            id=user.id,
            role=user.role,
            username=user.username,
            name=user.name,
            display_username=user.display_username,
            gender=user.gender,
            password_hash=user.password_hash,
            last_username_changed_at=user.last_username_changed_at,
            last_password_changed_at=user.last_password_changed_at,
        )
        session.add(remote)
    else:
        remote.role = user.role
        remote.username = user.username
        remote.name = user.name
        remote.display_username = user.display_username
        remote.gender = user.gender
        remote.password_hash = user.password_hash
        remote.last_username_changed_at = user.last_username_changed_at
        remote.last_password_changed_at = user.last_password_changed_at
    session.flush()
    return remote


def _upsert_control(session: Session, control: AccountControl | None) -> None:
    if control is None:
        return
    remote = session.query(AccountControl).filter_by(user_id=control.user_id).first()
    if remote is None:
        remote = AccountControl(user_id=control.user_id)
        session.add(remote)
    remote.is_enabled = control.is_enabled
    remote.risk_tags = list(control.risk_tags or [])
    remote.availability = control.availability


def sync_counselor(user: User, profile: Counselor, control: AccountControl | None) -> None:
    def operation(session: Session) -> None:
        _upsert_user(session, user)
        remote_profile = session.query(Counselor).filter_by(user_id=user.id).first()
        if remote_profile is None:
            remote_profile = Counselor(id=profile.id, user_id=user.id)
            session.add(remote_profile)
        remote_profile.title = profile.title
        remote_profile.specialty = profile.specialty
        remote_profile.bio = profile.bio
        _upsert_control(session, control)

    _with_remote(operation)


def sync_student(user: User, control: AccountControl | None) -> None:
    def operation(session: Session) -> None:
        _upsert_user(session, user)
        _upsert_control(session, control)

    _with_remote(operation)


def sync_resource(resource: Resource) -> None:
    def operation(session: Session) -> None:
        remote = session.get(Resource, resource.id)
        if remote is None:
            remote = Resource(id=resource.id)
            session.add(remote)
        remote.title = resource.title
        remote.type = resource.type
        remote.content = resource.content
        remote.url = resource.url
        remote.is_active = resource.is_active

    _with_remote(operation)


def delete_resource(resource_id: int) -> None:
    def operation(session: Session) -> None:
        remote = session.get(Resource, resource_id)
        if remote is not None:
            session.delete(remote)

    _with_remote(operation)


def _probe_url(base_url: str, api_key: str = "") -> bool:
    """通过轻量 GET 判断服务可达;任何 HTTP 响应都表示网络可达。"""
    if not base_url:
        return False
    import httpx

    try:
        response = httpx.get(
            base_url.rstrip("/"),
            headers={"Authorization": f"Bearer {api_key}"} if api_key else {},
            timeout=1.0,
            trust_env=False,
        )
        return response.status_code < 600
    except httpx.HTTPError:
        return False


def _probe_tcp(host: str, port: int) -> bool:
    import socket

    try:
        with socket.create_connection((host, port), timeout=1.5):
            return True
    except OSError:
        return False


def _service(*, service_id: str, label: str, model: str, base_url: str, api_key: str) -> dict:
    configured = bool(api_key and base_url and model)
    return {
        "id": service_id,
        "label": label,
        "status": "reachable" if configured and _probe_url(base_url, api_key) else "configured" if configured else "disabled",
        "model": model or None,
        "base_url": base_url or None,
    }


def service_status() -> dict:
    settings = get_settings()
    llm = resolve_service("llm")
    embedding = resolve_service("embedding")
    tts = resolve_service("tts")
    service_configs = [
        {"service_id": llm.service_id, "label": llm.label, "model": llm.model, "base_url": llm.base_url, "api_key": llm.api_key},
        {"service_id": embedding.service_id, "label": embedding.label, "model": embedding.model, "base_url": embedding.base_url, "api_key": embedding.api_key},
        {"service_id": tts.service_id, "label": tts.label, "model": tts.model, "base_url": tts.base_url, "api_key": tts.api_key},
    ]
    with ThreadPoolExecutor(max_workers=3) as executor:
        services = list(executor.map(lambda config: _service(**config), service_configs))
    return {
        "services": services,
        "lan_sync": {
            "status": "reachable" if sync_enabled() and _probe_tcp(settings.sync_postgres_host, settings.sync_postgres_port) else "configured" if sync_enabled() else "disabled",
            "host": settings.sync_postgres_host or None,
            "database": settings.sync_postgres_db or None,
        },
    }
