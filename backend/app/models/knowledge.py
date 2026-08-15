from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text, func
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
    """知识块(父子分块,Smal-to-Big):

    - 父块 `is_parent=True`:整节文本,不向量化,供检索命中后回查上下文;
    - 子块 `is_parent=False`:带 [文档 > 节] 前缀的小块,向量存 Milvus,`parent_id` 指向父块。
    """

    __tablename__ = "knowledge_chunks"

    id: Mapped[int] = mapped_column(primary_key=True)
    doc_id: Mapped[int] = mapped_column(ForeignKey("knowledge_docs.id"), index=True)
    content: Mapped[str] = mapped_column(Text)
    seq: Mapped[int] = mapped_column(Integer, default=0)
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("knowledge_chunks.id"), index=True, nullable=True
    )
    is_parent: Mapped[bool] = mapped_column(Boolean, default=False)
