from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AccountControl(Base):
    """管理员维护的账号状态和非敏感运营标签。"""

    __tablename__ = "admin_account_controls"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, index=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    risk_tags: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    availability: Mapped[str] = mapped_column(String(256), default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class ApiServiceConfig(Base):
    """管理员可调整的模型服务配置。

    API key 只以应用级密钥加密后的值保存；fallback 字段是同一服务的备用端点。
    用量是服务端累计值，前端只能读取统计数字，不能读取连接密钥。
    """

    __tablename__ = "admin_api_service_configs"

    service_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    label: Mapped[str] = mapped_column(String(64), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    base_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    model: Mapped[str | None] = mapped_column(String(128), nullable=True)
    api_key_encrypted: Mapped[str | None] = mapped_column(String(4096), nullable=True)
    context_window: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    timeout_seconds: Mapped[int] = mapped_column(Integer, default=120, nullable=False)
    token_budget: Mapped[int | None] = mapped_column(Integer, nullable=True)
    fallback_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    fallback_base_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    fallback_model: Mapped[str | None] = mapped_column(String(128), nullable=True)
    fallback_api_key_encrypted: Mapped[str | None] = mapped_column(String(4096), nullable=True)
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    request_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    failure_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
