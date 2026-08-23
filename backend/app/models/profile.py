from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, JSON, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class UserProfileSettings(Base):
    """学生画像授权与自助修订节流设置。"""

    __tablename__ = "user_profile_settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, index=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    consented_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    questionnaire_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_self_edit_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # 团队旧契约名称；与 last_self_edit_at 同步写入，便于平滑迁移。
    last_manual_edit_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class UserProfileSnapshot(Base):
    """学生可见的版本化画像快照。"""

    __tablename__ = "user_profile_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    version: Mapped[int] = mapped_column(nullable=False)
    source: Mapped[str] = mapped_column(String(32), nullable=False)
    content: Mapped[dict] = mapped_column(JSON, nullable=False)
    is_current: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (UniqueConstraint("user_id", "version", name="uq_profile_snapshot_version"),)


class UserProfileObservation(Base):
    """来自独立会话的、可解释的画像候选证据。"""

    __tablename__ = "user_profile_observations"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id"), index=True)
    trait_key: Mapped[str] = mapped_column(String(64), nullable=False)
    value: Mapped[str] = mapped_column(String(128), nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="candidate", nullable=False)
    confidence: Mapped[float] = mapped_column(default=0.4, nullable=False)
    evidence_count: Mapped[int] = mapped_column(default=1, nullable=False)
    evidence: Mapped[str] = mapped_column(Text, default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint(
            "user_id", "session_id", "trait_key", "value", name="uq_profile_observation_session"
        ),
    )


class UserProfileAnalysisRun(Base):
    """每日画像 AI 分析运行记录，用于幂等和审计，不保存完整聊天原文。"""

    __tablename__ = "user_profile_analysis_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    analysis_date: Mapped[date] = mapped_column(Date, nullable=False)
    session_ids: Mapped[list[int]] = mapped_column(JSON, default=list, nullable=False)
    input_hash: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    result: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="running", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        UniqueConstraint("user_id", "analysis_date", name="uq_profile_analysis_user_date"),
    )


# 兼容团队现有测试和旧路由命名。
ProfileSettings = UserProfileSettings
ProfileSnapshot = UserProfileSnapshot
ProfileObservation = UserProfileObservation
ProfileAnalysisRun = UserProfileAnalysisRun
