"""知识入库管道:读取文档 → 分块 → 元数据写 PostgreSQL → 向量写 Milvus。

向量与元数据按 chunk id 一一对应;向量入库失败时回滚本次文档的元数据,
避免出现"PG 有元数据、Milvus 无向量"的孤儿 chunk。
"""

import re
from pathlib import Path

from sqlalchemy.orm import Session

from app.adapters import embedding
from app.ai.rag.chunking import chunk_text
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
    """读取一份 markdown 文档入库,返回生成的 chunk 数。

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
    texts = chunk_text(text)
    if not texts:
        return 0

    # 先向量化:失败则无任何写入
    vectors = embedding.embed(texts)

    own_db = db is None
    session = db or SessionLocal()
    try:
        doc = KnowledgeDoc(title=_extract_title(p, text), source=p.name, content_type="md")
        session.add(doc)
        session.flush()

        chunks = [KnowledgeChunk(doc_id=doc.id, content=t, seq=i) for i, t in enumerate(texts)]
        session.add_all(chunks)
        session.flush()  # 拿到 chunk id

        store = store or MilvusStore()
        try:
            store.upsert_chunks([{"id": c.id, "vector": v} for c, v in zip(chunks, vectors)])
        except Exception:
            session.query(KnowledgeChunk).filter(KnowledgeChunk.doc_id == doc.id).delete()
            session.delete(doc)
            session.commit()
            raise
        session.commit()
        return len(chunks)
    finally:
        if own_db:
            session.close()
