from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# 情绪类别固定枚举(铁律),勿改
EMOTION_CATEGORIES = ["anxious", "sad", "angry", "lonely", "tired", "calm", "hopeful"]


class Emotion(Base):
    """结构化情绪记录;仅在 LLM 生成情绪日记时一并产出,关联 journal。"""

    __tablename__ = "emotions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    journal_id: Mapped[int | None] = mapped_column(ForeignKey("journals.id"), index=True)
    session_id: Mapped[int | None] = mapped_column(ForeignKey("sessions.id"), index=True)
    category: Mapped[str] = mapped_column(String(32))
    intensity: Mapped[int] = mapped_column(Integer)
    stress_source: Mapped[str | None] = mapped_column(String(256))
    support_need: Mapped[str | None] = mapped_column(String(256))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Journal(Base):
    """LLM 基于聊天内容生成的情绪日记(摘要 + 内容 + 情绪分)。"""

    __tablename__ = "journals"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    session_id: Mapped[int | None] = mapped_column(ForeignKey("sessions.id"), index=True)
    summary: Mapped[str] = mapped_column(Text, default="")
    content: Mapped[str] = mapped_column(Text, default="")
    mood_score: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
