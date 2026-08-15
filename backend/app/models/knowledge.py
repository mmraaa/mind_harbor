from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class KnowledgeDoc(Base):
    """知识库文档(入库来源)。"""

    __tablename__ = "knowledge_docs"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(256))
    source: Mapped[str | None] = mapped_column(String(256))
    content_type: Mapped[str] = mapped_column(String(32), default="md")
    meta: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class KnowledgeChunk(Base):
    """知识块元数据:内容与来源存 PostgreSQL,向量存 Milvus(collection: knowledge_chunks,按 chunk id 对应)。"""

    __tablename__ = "knowledge_chunks"

    id: Mapped[int] = mapped_column(primary_key=True)
    doc_id: Mapped[int] = mapped_column(ForeignKey("knowledge_docs.id"), index=True)
    content: Mapped[str] = mapped_column(Text)
    seq: Mapped[int] = mapped_column(Integer, default=0)
