"""知识入库管道(Advanced RAG):读取文档 → 父子分块 → 元数据写 PostgreSQL → 子块向量写 Milvus。

- 父块(整节,`is_parent=True`)只存 PostgreSQL,不向量化;
- 子块(带 `[文档 > 节]` 前缀,`is_parent=False`)向量存 Milvus,`parent_id` 指向父块;
- 向量入库失败时回滚本次文档全部元数据,避免孤儿 chunk。
"""

import re
from pathlib import Path

from sqlalchemy.orm import Session

from app.adapters import embedding
from app.ai.rag.chunking import chunk_document
from app.ai.rag.milvus import MilvusStore
from app.core.database import SessionLocal
from app.models.knowledge import KnowledgeChunk, KnowledgeDoc


def _extract_title(path: Path, text: str) -> str:
    """标题取首个 `# ` 一级标题,没有则回退到文件名。"""
    for line in text.splitlines():
        m = re.match(r"^#\s+(.+)$", line.strip())
        if m:
            return m.group(1).strip()
    return path.stem


def ingest_document(path: str | Path, db: Session | None = None, store: MilvusStore | None = None) -> int:
    """读取一份 markdown 文档入库,返回生成的子块数(父块不计入)。

    Args:
        path: 文档路径(md)。
        db: 数据库会话(测试注入用);缺省自动创建。
        store: MilvusStore(测试注入测试 collection);缺省用生产 collection。

    Raises:
        FileNotFoundError: 文档不存在。
        RuntimeError: embedding 未配置。
        Exception: 上游错误,此时数据库无残留。
    """
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    chunks = chunk_document(text)
    if not chunks:
        return 0

    # 先向量化子块:失败则无任何写入
    vectors = embedding.embed([c.content for c in chunks])

    own_db = db is None
    session = db or SessionLocal()
    try:
        doc = KnowledgeDoc(title=_extract_title(p, text), source=p.name, content_type="md")
        session.add(doc)
        session.flush()

        parent_by_section: dict[str, KnowledgeChunk] = {}
        child_rows: list[tuple[KnowledgeChunk, list[float]]] = []

        for c in chunks:
            # 父块按节去重(整节文本)
            if c.section not in parent_by_section:
                parent = KnowledgeChunk(
                    doc_id=doc.id, content=c.parent_content, seq=-1, is_parent=True
                )
                session.add(parent)
                session.flush()
                parent_by_section[c.section] = parent

            child = KnowledgeChunk(
                doc_id=doc.id,
                content=c.content,
                seq=c.seq,
                parent_id=parent_by_section[c.section].id,
                is_parent=False,
            )
            session.add(child)
            session.flush()
            child_rows.append((child, vectors[c.seq]))

        store = store or MilvusStore()
        try:
            store.upsert_chunks([{"id": child.id, "vector": v} for child, v in child_rows])
        except Exception:
            session.query(KnowledgeChunk).filter(KnowledgeChunk.doc_id == doc.id).delete()
            session.delete(doc)
            session.commit()
            raise
        session.commit()
        return len(child_rows)
    finally:
        if own_db:
            session.close()
