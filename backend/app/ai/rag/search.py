"""RAG 在线检索:query → embedding → Milvus 余弦 top-k → PostgreSQL 取内容与来源。

可选关键词混合(`keyword` 参数):关键词命中(PostgreSQL ILIKE)优先,
再按向量相似度补足,合并去重后取 top_k。
检索为空(或查询为空白)时返回空列表,禁止编造。
"""

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.adapters import embedding
from app.ai.rag.milvus import MilvusStore
from app.core.database import SessionLocal
from app.models.knowledge import KnowledgeChunk, KnowledgeDoc


@dataclass
class ChunkHit:
    """一条检索命中:正文 + 来源标题(供前端展示"参考来源"卡片)。"""

    text: str
    doc_title: str
    chunk_id: int | None = None
    score: float = 0.0


def _to_hit(row: KnowledgeChunk, score: float, session: Session) -> ChunkHit:
    doc = session.get(KnowledgeDoc, row.doc_id)
    return ChunkHit(
        text=row.content,
        doc_title=doc.title if doc else "",
        chunk_id=row.id,
        score=score,
    )


def search(
    query: str,
    top_k: int = 5,
    keyword: str | None = None,
    db: Session | None = None,
    store: MilvusStore | None = None,
) -> list[ChunkHit]:
    """向量检索(可选关键词混合),返回带来源的命中,按相关性降序。

    Args:
        query: 用户问题。
        top_k: 返回条数上限。
        keyword: 可选关键词(如危机关键词);命中结果置于向量结果之前。
        db: 数据库会话(测试注入用);缺省自动创建。
        store: MilvusStore(测试注入测试 collection);缺省用生产 collection。
    """
    store = store or MilvusStore()
    store.ensure_collection()
    if not query or not query.strip():
        return []

    qvec = embedding.embed([query])[0]
    vec_hits = store.search(qvec, top_k)

    own_db = db is None
    session = db or SessionLocal()
    try:
        ranked: list[ChunkHit] = []
        seen: set[int] = set()

        if keyword and keyword.strip():
            pattern = f"%{keyword.strip()}%"
            for row in session.query(KnowledgeChunk).filter(KnowledgeChunk.content.ilike(pattern)).all():
                if len(ranked) >= top_k:
                    break
                ranked.append(_to_hit(row, 1.0, session))
                seen.add(row.id)

        for vh in vec_hits:
            if len(ranked) >= top_k:
                break
            row = session.get(KnowledgeChunk, vh["id"])
            if row is None or row.id in seen:
                continue  # Milvus 有而 PG 无(脏数据),跳过
            ranked.append(_to_hit(row, vh["distance"], session))
            seen.add(row.id)

        return ranked[:top_k]
    finally:
        if own_db:
            session.close()
