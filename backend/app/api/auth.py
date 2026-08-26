from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.admin_module.models import AccountControl
from app.api.deps import get_current_user
from app.core.database import get_db
from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import User
from app.schemas.user import (
    LoginRequest,
    AccountUpdate,
    PasswordChange,
    ProfileUpdate,
    RegisterRequest,
    TokenResponse,
    UserOut,
)

router = APIRouter(prefix="/auth", tags=["auth"])

ACCOUNT_CHANGE_INTERVAL = timedelta(days=7)


def _display_username(user: User) -> str:
    return user.display_username or user.name or user.username


def _user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        username=user.username,
        name=user.name,
        role=user.role,
        display_username=_display_username(user),
        gender=user.gender or "",
    )


def _next_change(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    normalized = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return normalized + ACCOUNT_CHANGE_INTERVAL


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.query(User).filter_by(username=body.username).first()
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "用户名或密码错误")
    control = db.query(AccountControl).filter_by(user_id=user.id).first()
    if control is not None and not control.is_enabled:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "账号已停用，请联系管理员")
    return TokenResponse(
        access_token=create_access_token(user.id),
        user=_user_out(user),
    )


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> UserOut:
    return _user_out(user)


@router.patch("/me", response_model=UserOut)
def update_me(
    body: ProfileUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserOut:
    """修改基础资料:当前仅支持昵称 name;role/username 不可改(显式传入返回 400)。

    email/phone 为后续功能,未提供字段;传入将被忽略(不报错、不落库)。
    """
    forbidden = IMMUTABLE_FIELDS & set(body.model_extra or {})
    if forbidden:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "role/username 不可修改")
    if body.name is not None:
        user.name = body.name
    db.commit()
    db.refresh(user)
    return _user_out(user)


@router.get("/account")
def account(user: User = Depends(get_current_user)) -> dict:
    return {
        "id": user.id,
        "account": user.username,
        "username": user.username,
        "display_username": _display_username(user),
        "name": user.name,
        "gender": user.gender or "",
        "role": user.role,
        "next_username_change_at": _next_change(user.last_username_changed_at),
        "next_password_change_at": _next_change(user.last_password_changed_at),
    }


@router.patch("/account")
def update_account(
    body: AccountUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    if body.username is not None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "账号不可修改")
    now = datetime.now(timezone.utc)
    values = body.model_dump(exclude_unset=True, exclude={"username"})
    display_username = values.pop("display_username", None)
    if display_username is not None:
        display_username = display_username.strip()
        if not display_username:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "用户名不能为空")
        last_changed = user.last_username_changed_at
        if last_changed and now - (last_changed if last_changed.tzinfo else last_changed.replace(tzinfo=timezone.utc)) < ACCOUNT_CHANGE_INTERVAL:
            next_at = _next_change(user.last_username_changed_at)
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                detail={"message": "用户名每 7 天只能修改一次", "next_username_change_at": next_at.isoformat()},
                headers={"X-Next-Username-Change-At": next_at.isoformat()},
            )
        duplicate = (
            db.query(User)
            .filter(
                func.lower(func.trim(User.display_username)) == display_username.lower(),
                User.id != user.id,
            )
            .first()
        )
        if duplicate:
            raise HTTPException(status.HTTP_409_CONFLICT, "用户名已被使用")
        user.display_username = display_username.strip()
        user.last_username_changed_at = now
    for field in ("name", "gender"):
        if field in values:
            value = values[field].strip()
            if field == "name" and not value:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "姓名不能为空")
            setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return account(user)


@router.put("/password")
def change_password(
    body: PasswordChange,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """修改密码:校验旧密码后写入新哈希;每七天最多修改一次。"""
    if not verify_password(body.old_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "旧密码错误")
    if len(body.new_password) < 6:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "新密码至少 6 位")
    now = datetime.now(timezone.utc)
    last_changed = user.last_password_changed_at
    if last_changed and now - (last_changed if last_changed.tzinfo else last_changed.replace(tzinfo=timezone.utc)) < ACCOUNT_CHANGE_INTERVAL:
        next_at = _next_change(last_changed)
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"message": "密码每 7 天只能修改一次", "next_password_change_at": next_at.isoformat()},
            headers={"X-Next-Password-Change-At": next_at.isoformat()},
        )
    user.password_hash = hash_password(body.new_password)
    user.last_password_changed_at = now
    db.commit()
    return {"detail": "密码修改成功", "next_password_change_at": _next_change(now).isoformat()}


@router.post("/register", response_model=TokenResponse)
def register(body: RegisterRequest, db: Session = Depends(get_db)) -> TokenResponse:
    """学生注册(注册即登录);用户名重复返回 409。"""
    exists = db.query(User).filter_by(username=body.username).first()
    if exists is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "用户名已被使用")
    user = User(
        role="student",
        username=body.username,
        name=body.name or body.username,
        display_username=body.name or body.username,
        password_hash=hash_password(body.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return TokenResponse(
        access_token=create_access_token(user.id),
        user=_user_out(user),
    )
