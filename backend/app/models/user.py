from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

# 角色固定枚举(铁律):student / counselor / admin
ROLE_STUDENT = "student"
ROLE_COUNSELOR = "counselor"
ROLE_ADMIN = "admin"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    role: Mapped[str] = mapped_column(String(20), default=ROLE_STUDENT)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(64), default="")
    # 登录账号 username 不可变；display_username 是用户可修改的展示名称。
    # nullable 兼容迁移前的旧用户，接口层会回退到 name。
    display_username: Mapped[str | None] = mapped_column(String(64), nullable=True)
    gender: Mapped[str | None] = mapped_column(String(16), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(128))
    last_username_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_password_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Counselor(Base):
    """咨询师资料,挂在 users(role=counselor) 下。"""

    __tablename__ = "counselors"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    title: Mapped[str] = mapped_column(String(64), default="")
    specialty: Mapped[str] = mapped_column(String(256), default="")
    bio: Mapped[str] = mapped_column(String(1024), default="")
    user: Mapped["User"] = relationship()
