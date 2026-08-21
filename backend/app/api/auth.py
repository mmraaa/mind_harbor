from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.admin_module.models import AccountControl
from app.api.deps import get_current_user
from app.core.database import get_db
from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import User
from app.schemas.user import (
    LoginRequest,
    PasswordChange,
    ProfileUpdate,
    RegisterRequest,
    TokenResponse,
    UserOut,
)

router = APIRouter(prefix="/auth", tags=["auth"])

# 固定不可由个人修改的字段(与角色体系绑定)
IMMUTABLE_FIELDS = {"role", "username"}


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
        user=UserOut.model_validate(user),
    )


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(user)


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
    return UserOut.model_validate(user)


@router.put("/password")
def change_password(
    body: PasswordChange,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """修改密码:校验旧密码后写入新哈希;旧 JWT 仍有效(设计决策,无黑名单)。"""
    if not verify_password(body.old_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "旧密码错误")
    if len(body.new_password) < 6:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "新密码至少 6 位")
    user.password_hash = hash_password(body.new_password)
    db.commit()
    return {"detail": "密码修改成功"}


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
        password_hash=hash_password(body.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return TokenResponse(
        access_token=create_access_token(user.id),
        user=UserOut.model_validate(user),
    )
