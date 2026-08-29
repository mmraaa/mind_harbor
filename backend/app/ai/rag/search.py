"""RAG 在线检索(Advanced RAG 查询优化):向量 + 关键词 RRF 混合检索,命中子块回查父块。

- **混合检索**:Milvus 余弦向量检索 + PostgreSQL ILIKE 关键词精确匹配;
- **RRF 融合**:Reciprocal Rank Fusion 对两路结果按排名融合(关键词加权 1.5,
  因精确匹配比向量相似更可信),而非简单拼接/前置;
- **Small-to-Big**:命中子块后回查父块(整节文本)作为 `context` 供 LLM,上下文更完整;
- 检索为空(或查询为空白)时返回空列表,禁止编造。
"""

import re
from dataclasses import dataclass
import jieba 
from sqlalchemy.orm import Session

from app.adapters import embedding
from app.ai.rag.milvus import MilvusStore
from app.core.database import SessionLocal
from app.models.knowledge import KnowledgeChunk, KnowledgeDoc

RRF_K = 60
KEYWORD_WEIGHT = 1.5


@dataclass
class ChunkHit:
    """一条检索命中:子块正文 + 来源标题 + 父块上下文(供 LLM)。"""

    text: str
    doc_title: str
    chunk_id: int | None = None
    score: float = 0.0
    context: str | None = None


def _extract_keywords(text: str, limit: int = 4) -> list[str]:
    """使用 jieba 分词后，提取检索关键词。
    过滤标准：中文 ≥ 2 字，英文 ≥ 3 字母
    """
    if not text:
        return []
        
    # 1. 使用 jieba 精确模式分词
    raw_words = jieba.lcut(text)
    
    keywords = []
    for word in raw_words:
        # 去除两端空格
        word = word.strip()
        
        # 2. 判断是否符合过滤标准：
        # 如果是纯汉字且长度>=2，或者纯英文且长度>=3
        if re.match(r"^[一-鿿]{2,}$", word) or re.match(r"^[A-Za-z]{3,}$", word):
            keywords.append(word)
            
        # 3. 达到限制数量则提前结束
        if len(keywords) == limit:
            break
            
    return keywords


def _rrf_merge(vector_hits: list[dict], kw_chunk_ids: list[int], k: int = RRF_K) -> list[tuple[int, float]]:
    """Reciprocal Rank Fusion:融合两路命中的 id 排序(降序)。关键词加权。

    Args:
        vector_hits: Milvus 向量路命中(list[dict],按相似度降序,每项含 `id`)。
        kw_chunk_ids: 关键词路命中的 chunk id 列表(已去重,保持首次出现顺序)。
        k: RRF 平滑常数(默认 60):单路贡献 `1/(k + rank)`,k 越大排名差异越平滑。

    Returns:
        list[(chunk_id, rrf_score)]:按 rrf 分数降序(同分按 chunk_id 升序保证稳定)。

    为什么用 RRF 且关键词加权:
        向量相似度与 ILIKE 命中是两个不可直接比较的打分体系;RRF 只依赖「排名」,
        天然可比。KEYWORD_WEIGHT=1.5 是因为字面精确命中比"像但不确定"的向量
        相似更可信,故提高其在融合中的贡献。
    """
    score: dict[int, float] = {}
    for rank, hit in enumerate(vector_hits, start=1):
        score[hit["id"]] = score.get(hit["id"], 0.0) + 1.0 / (k + rank)
    for rank, cid in enumerate(kw_chunk_ids, start=1):
        score[cid] = score.get(cid, 0.0) + KEYWORD_WEIGHT / (k + rank)
    return sorted(score.items(), key=lambda kv: (-kv[1], kv[0]))


def search(
    query: str,
    top_k: int = 5,
    keyword: str | None = None,
    db: Session | None = None,
    store: MilvusStore | None = None,
) -> list[ChunkHit]:
    """Advanced RAG 混合检索,返回带来源与父块上下文的命中(相关性降序)。

    Args:
        query: 用户问题。
        top_k: 返回条数上限。
        keyword: 可选显式关键词(覆盖从 query 自动提取);缺省自动从 query 提取。
        db: 数据库会话(测试注入用);缺省自动创建。
        store: MilvusStore(测试注入测试 collection);缺省用生产 collection。
    """
    
    store = store or MilvusStore()
    store.ensure_collection()
    if not query or not query.strip():
        return []

    qvec = embedding.embed([query])[0]
    vec_hits = store.search(qvec, top_k * 2)  # 多取一些供 RRF 融合

    own_db = db is None
    session = db or SessionLocal()
    try:
        terms = _extract_keywords(keyword or query)
        kw_ids: list[int] = []
        if terms:
            base = (
                session.query(KnowledgeChunk.id)
                .filter(KnowledgeChunk.is_parent.is_(False))
                .filter(KnowledgeChunk.content.ilike(f"%{terms[0]}%"))
                .all()
            )
            kw_ids = [r[0] for r in base]
            for t in terms[1:]:
                extra = (
                    session.query(KnowledgeChunk.id)
                    .filter(KnowledgeChunk.is_parent.is_(False))
                    .filter(KnowledgeChunk.content.ilike(f"%{t}%"))
                    .all()
                )
                kw_ids.extend(r[0] for r in extra)
            # 保持首次出现顺序去重
            seen: set[int] = set()
            kw_ids = [i for i in kw_ids if not (i in seen or seen.add(i))]

        ranked: list[ChunkHit] = []
        seen_rows: set[int] = set()
        for cid, rrf in _rrf_merge(vec_hits, kw_ids):
            if len(ranked) >= top_k:
                break
            if cid in seen_rows:
                continue
            row = session.get(KnowledgeChunk, cid)
            if row is None or row.is_parent:
                continue  # Milvus 有而 PG 无(脏数据)或误命中父块,跳过
            seen_rows.add(cid)
            # Small-to-Big:命中子块后回取父块整节文本作 LLM 上下文(父块本身不向量化)
            parent = session.get(KnowledgeChunk, row.parent_id) if row.parent_id else None
            context = parent.content if parent else row.content
            doc = session.get(KnowledgeDoc, row.doc_id)
            ranked.append(
                ChunkHit(
                    text=row.content,
                    doc_title=doc.title if doc else "",
                    chunk_id=row.id,
                    score=float(rrf),
                    context=context,
                )
            )
        return ranked[:top_k]
    finally:
        if own_db:
            session.close()
