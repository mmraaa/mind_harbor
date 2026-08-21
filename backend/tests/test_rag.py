"""RAG 知识库测试:分块 / 入库 / 在线检索 / Milvus 封装。

约定:
- embedding 一律用 monkeypatch 假实现(fake_embed),不真实调用 API;
- Milvus 使用独立测试 collection `knowledge_chunks_test`,用完即删,不污染 `knowledge_chunks`。
"""

import hashlib
import math
import random

import pytest

from app.ai.rag.chunking import chunk_document, chunk_text
from app.ai.rag.ingest import ingest_document
from app.ai.rag.milvus import MilvusStore
from app.ai.rag.search import search
from app.models.knowledge import KnowledgeChunk, KnowledgeDoc

TEST_COLLECTION = "knowledge_chunks_test"

# 假 embedding 的词表:命中词映射到固定向量维度,保证"语义"可复现
VOCAB = ["考试", "焦虑", "咨询", "预约", "失眠", "呼吸", "压力", "正念"]


def fake_embed(texts: list[str]) -> list[list[float]]:
    """确定性假 embedding:词表命中 → 对应维度置 1 后归一化;无命中 → 按文本哈希生成稳定向量。"""
    out = []
    for t in texts:
        v = [0.0] * 1024
        for i, w in enumerate(VOCAB):
            if w in t:
                v[i] = 1.0
        norm = math.sqrt(sum(x * x for x in v))
        if norm == 0:
            rnd = random.Random(int(hashlib.md5(t.encode()).hexdigest()[:8], 16))
            v = [rnd.random() for _ in range(1024)]
            norm = math.sqrt(sum(x * x for x in v))
        out.append([x / norm for x in v])
    return out


@pytest.fixture
def patch_embed(monkeypatch):
    monkeypatch.setattr("app.adapters.embedding.embed", fake_embed)


@pytest.fixture
def milvus_store():
    store = MilvusStore(collection=TEST_COLLECTION)
    store.drop()  # 清理上次失败残留
    store.ensure_collection()
    yield store
    store.drop()


SAMPLE_DOC = """# 考试焦虑应对

考试焦虑是常见的学业压力反应,表现为心跳加快、注意力不集中。

应对方法包括:拆分复习计划、规律作息、正念呼吸练习。

如果焦虑持续两周以上,建议预约校内心理咨询。
"""

FLOW_DOC = """# 校内心理咨询预约流程

学生可通过线上系统或现场登记预约心理咨询。

初次咨询包括评估与沟通,建议提前准备想聊的话题。

紧急情况下可拨打心理危机干预热线。
"""


# ---------- Step 1: 分块 ----------


def test_chunk_text_by_paragraphs():
    """多段短文合为一个块(段落累积)。"""
    chunks = chunk_text(SAMPLE_DOC, max_chars=2000)
    assert len(chunks) == 1
    assert "考试焦虑是常见的学业压力反应" in chunks[0]
    assert "建议预约校内心理咨询" in chunks[0]


def test_chunk_text_paragraph_exceeds_window():
    """长段落超过窗口 → 固定窗口(带 overlap)切分。"""
    para = "长" * 1100
    chunks = chunk_text(para, max_chars=500, overlap=50)
    assert len(chunks) == 3
    assert all(len(c) <= 500 for c in chunks)
    assert chunks[0] == para[:500]
    assert chunks[-1].endswith("长")  # 末尾不丢内容


def test_chunk_text_accumulate_until_max():
    """多个短段累积到窗口上限后封块。"""
    paras = "\n\n".join(f"段落{i}:" + "内容" * 200 for i in range(4))
    chunks = chunk_text(paras, max_chars=500)
    assert len(chunks) >= 2
    assert all(len(c) <= 500 for c in chunks)


def test_chunk_text_empty():
    assert chunk_text("") == []
    assert chunk_text("  \n\n  ") == []


# ---------- Step 1: 入库管道 ----------


def test_ingest_document_persists_and_returns_count(db, milvus_store, patch_embed, tmp_path):
    path = tmp_path / "考试焦虑.md"
    path.write_text(SAMPLE_DOC, encoding="utf-8")

    expected = len(chunk_document(SAMPLE_DOC))
    n = ingest_document(path, db=db, store=milvus_store)

    assert n == expected
    doc = db.query(KnowledgeDoc).filter_by(source="考试焦虑.md").first()
    assert doc is not None
    assert doc.title == "考试焦虑应对"  # 取首个 # 标题

    children = (
        db.query(KnowledgeChunk)
        .filter_by(doc_id=doc.id, is_parent=False)
        .order_by(KnowledgeChunk.seq)
        .all()
    )
    parents = db.query(KnowledgeChunk).filter_by(doc_id=doc.id, is_parent=True).all()
    assert len(children) == n
    assert [c.seq for c in children] == list(range(n))
    assert len(parents) >= 1
    assert all(c.parent_id is not None for c in children)

    # 子块向量已写入 Milvus:用同一块文本的向量检索,首条命中即该 chunk
    vec = fake_embed([children[0].content])[0]
    hits = milvus_store.search(vec, top_k=3)
    assert hits and hits[0]["id"] == children[0].id
    assert hits[0]["distance"] == pytest.approx(1.0)


def test_ingest_document_empty_file_returns_zero(db, milvus_store, patch_embed, tmp_path):
    path = tmp_path / "empty.md"
    path.write_text("", encoding="utf-8")
    assert ingest_document(path, db=db, store=milvus_store) == 0


# ---------- Step 2: 在线检索 ----------


def _ingest_fixture(db, milvus_store, tmp_path):
    """灌入两份样例语料(考试焦虑 / 咨询流程),返回 (paths)。"""
    p1 = tmp_path / "考试焦虑.md"
    p1.write_text(SAMPLE_DOC, encoding="utf-8")
    p2 = tmp_path / "咨询流程.md"
    p2.write_text(FLOW_DOC, encoding="utf-8")
    ingest_document(p1, db=db, store=milvus_store)
    ingest_document(p2, db=db, store=milvus_store)
    return p1, p2


def test_search_recall_and_source(db, milvus_store, patch_embed, tmp_path):
    _ingest_fixture(db, milvus_store, tmp_path)
    hits = search("考试焦虑怎么缓解", top_k=3, db=db, store=milvus_store)

    assert hits, "检索不应为空"
    top = hits[0]
    assert "考试焦虑" in top.text
    assert top.doc_title == "考试焦虑应对"  # 引用来源正确
    assert top.score > hits[-1].score  # 相关性降序
    assert all(h.doc_title for h in hits)


def test_search_empty_collection_returns_empty_list(db, milvus_store, patch_embed):
    """检索为空 → 返回空列表,不编造。"""
    assert search("考试焦虑", top_k=5, db=db, store=milvus_store) == []


def test_search_blank_query_returns_empty_list(db, milvus_store, patch_embed):
    assert search("   ", top_k=5, db=db, store=milvus_store) == []


def test_search_keyword_hybrid_boost(db, milvus_store, patch_embed, tmp_path):
    """关键词混合(RRF 加权):关键词命中(如"热线")应被召回并前置。"""
    _ingest_fixture(db, milvus_store, tmp_path)
    hits = search("失眠怎么办", top_k=5, keyword="热线", db=db, store=milvus_store)
    assert hits
    assert hits[0].doc_title == "校内心理咨询预约流程"
    assert "热线" in hits[0].text


def test_search_small_to_big_returns_parent_context(db, milvus_store, patch_embed, tmp_path):
    """Small-to-Big:命中子块 → context 为父块(整节)文本(去前缀、含完整正文)。"""
    _ingest_fixture(db, milvus_store, tmp_path)
    hits = search("考试焦虑", top_k=3, db=db, store=milvus_store)
    assert hits
    top = hits[0]
    assert top.context
    assert "[考试焦虑应对]" not in top.context  # 父块不带检索前缀
    assert "考试焦虑是常见的学业压力反应" in top.context  # 含整节正文
    assert top.context in top.text or "考试焦虑是" in top.text


def test_chunk_document_splits_on_h2_only():
    """按 ## 切分:每节一块,### 及以下保留在节内。"""
    doc = """# 心理中心
## 预约流程
线上预约,等待短信确认。
### 细节说明
短信会在 24 小时内发送。
## 值班安排
周一至周五 9:00-17:00。"""
    chunks = chunk_document(doc)
    assert len(chunks) == 2
    assert "[心理中心 > 预约流程]" in chunks[0].content
    assert "预约流程" in chunks[0].section
    assert "细节说明" in chunks[0].parent_content
    assert "短信会在 24 小时内发送。" in chunks[0].parent_content
    assert "[心理中心 > 值班安排]" in chunks[1].content
    assert "周一至周五 9:00-17:00。" in chunks[1].parent_content
    assert chunks[0].parent_content != chunks[1].parent_content


def test_chunk_document_fallback_without_h2():
    """无 ## 时整篇正文作为单节。"""
    chunks = chunk_document(SAMPLE_DOC)
    assert len(chunks) == 1
    assert "考试焦虑应对" in chunks[0].content
    assert "建议预约校内心理咨询" in chunks[0].parent_content


# ---------- Milvus 封装 ----------


def test_milvus_store_upsert_search_roundtrip(milvus_store):
    rows = [
        {"id": 101, "vector": fake_embed(["考试焦虑"])[0]},
        {"id": 102, "vector": fake_embed(["预约咨询"])[0]},
    ]
    assert milvus_store.upsert_chunks(rows) == 2
    res = milvus_store.search(fake_embed(["考试焦虑"])[0], top_k=2)
    assert res[0]["id"] == 101
    assert res[0]["distance"] == pytest.approx(1.0)
    assert res[0]["distance"] > res[1]["distance"]


def test_milvus_store_rejects_wrong_dimension(milvus_store):
    with pytest.raises(ValueError, match="维度"):
        milvus_store.upsert_chunks([{"id": 1, "vector": [0.1, 0.2]}])


# ---------- Embedding 适配器 ----------


def test_embed_calls_openai_compatible_endpoint(monkeypatch):
    from app.adapters import embedding as emb_mod
    from app.core.config import get_settings
    from app.services.api_config import ResolvedService

    s = get_settings()
    captured = {}

    # resolve_service 会读取开发库 admin_api_service_configs(应用配置),测试环境须显式注入,避免被库内配置覆盖
    monkeypatch.setattr(
        "app.adapters.embedding.resolve_service",
        lambda service_id: ResolvedService(
            "embedding",
            "向量模型",
            True,
            s.embedding_api_key,
            s.embedding_base_url,
            s.embedding_model,
        ),
    )

    def fake_post(url, **kwargs):
        captured["url"] = url
        captured["headers"] = kwargs.get("headers")
        captured["json"] = kwargs.get("json")

        class Resp:
            def raise_for_status(self):
                pass

            def json(self):
                return {"data": [{"embedding": [0.1] * s.embedding_dim}, {"embedding": [0.2] * s.embedding_dim}]}

        return Resp()

    monkeypatch.setattr(emb_mod.httpx, "post", fake_post)
    vecs = emb_mod.embed(["你好", "焦虑怎么办"])
    assert captured["url"] == s.embedding_base_url.rstrip("/") + "/embeddings"
    assert captured["headers"]["Authorization"].startswith("Bearer ")
    assert captured["json"]["model"] == s.embedding_model
    assert captured["json"]["input"] == ["你好", "焦虑怎么办"]
    assert len(vecs) == 2
    assert all(len(v) == s.embedding_dim for v in vecs)


def test_embed_raises_when_key_missing(monkeypatch):
    from app.adapters import embedding as emb_mod
    from app.core.config import Settings

    monkeypatch.setattr(
        emb_mod,
        "get_settings",
        lambda: Settings(embedding_api_key="", embedding_base_url="https://x/v1", embedding_model="m"),
    )
    with pytest.raises(RuntimeError, match="EMBEDDING_API_KEY"):
        emb_mod.embed(["测试"])


def test_embed_raises_when_model_missing(monkeypatch):
    from app.adapters import embedding as emb_mod
    from app.core.config import Settings

    monkeypatch.setattr(
        emb_mod,
        "get_settings",
        lambda: Settings(embedding_api_key="sk-x", embedding_base_url="https://x/v1", embedding_model=""),
    )
    with pytest.raises(RuntimeError, match="EMBEDDING_MODEL"):
        emb_mod.embed(["测试"])
