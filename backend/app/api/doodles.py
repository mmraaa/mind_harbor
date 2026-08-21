from __future__ import annotations

import struct

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from types import SimpleNamespace

from app.adapters.doodle_review import DoodleReviewError, analyze_doodle
from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import verify_token
from app.models.user import User

router = APIRouter(prefix="/doodles", tags=["doodles"])

MAX_IMAGE_BYTES = 5 * 1024 * 1024
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
bearer = HTTPBearer(auto_error=False)


def _team_identity(token: str) -> dict | None:
    """用团队后端的兼容身份接口验证令牌；失败时返回 None。"""
    base_url = get_settings().team_backend_base_url.strip()
    if not base_url:
        return None
    url = f"{base_url.rstrip('/')}/api/v1/auth/me"
    try:
        response = httpx.get(
            url,
            headers={"Authorization": f"Bearer {token}"},
            timeout=5,
            trust_env=False,
        )
        if response.status_code != 200:
            return None
        payload = response.json()
        return payload if isinstance(payload, dict) else None
    except (httpx.HTTPError, ValueError):
        return None


def require_student_compatibility(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "未登录")
    user: User | None = None
    try:
        user_id = verify_token(creds.credentials)
        try:
            user = db.get(User, user_id)
        except Exception:  # noqa: BLE001 - 本机镜像 schema 不一致时转为远程回查
            db.rollback()
    except Exception:  # noqa: BLE001 - 兼容团队 JWT 密钥不同的情况
        identity = _team_identity(creds.credentials)
        if identity:
            if isinstance(identity.get("username"), str):
                # 使用团队回查身份，不把远程账号写入本机用户表，避免 schema/ID 冲突。
                user = SimpleNamespace(
                    id=identity.get("id"),
                    username=identity["username"],
                    name=str(identity.get("name") or identity["username"]),
                    role=str(identity.get("role") or ""),
                )
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "token 无效或用户不存在")
    if user.role != "student":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "权限不足")
    return user


async def _read_png(image: UploadFile) -> bytes:
    if image.content_type != "image/png":
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "只支持 PNG 画作")
    content = await image.read(MAX_IMAGE_BYTES + 1)
    if not content:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "画作内容为空")
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "画作不能超过 5 MB")
    if not content.startswith(PNG_SIGNATURE) or len(content) < 24:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "画作文件无效")
    width, height = struct.unpack(">II", content[16:24])
    if not 1 <= width <= 4096 or not 1 <= height <= 4096:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "画作尺寸无效")
    return content


@router.post("/analyze")
async def analyze(
    image: UploadFile = File(...),
    _: User = Depends(require_student_compatibility),
    db: Session = Depends(get_db),
) -> dict:
    content = await _read_png(image)
    try:
        result = await analyze_doodle(content, media_type="image/png", db=db)
    except DoodleReviewError as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail={"code": "DOODLE_REVIEW_UNAVAILABLE", "displayMessage": "AI 温和观察暂时不可用，请稍后重试。"},
        ) from exc
    return result.as_dict()
