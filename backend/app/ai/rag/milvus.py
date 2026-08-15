"""Milvus 向量库封装(Milvus v3.0.0 本机 Docker)。

统一走 `pymilvus.MilvusClient`(ORM 风格 `connections.connect` 已弃用,勿用)。
collection schema:
    - 主键 `id`:INT64(与 PostgreSQL `knowledge_chunks.id` 一一对应),auto_id=False;
    - 向量 `vector`:FLOAT_VECTOR,维度 = 配置 `embedding_dim`(默认 1024);
    - 度量:COSINE。
"""

from pymilvus import MilvusClient

from app.core.config import get_settings

METRIC_TYPE = "COSINE"


class MilvusStore:
    """知识块向量的读写封装。"""

    def __init__(self, collection: str | None = None, dim: int | None = None, uri: str | None = None):
        s = get_settings()
        self.collection = collection or s.milvus_collection
        self.dim = dim or s.embedding_dim
        self._client = MilvusClient(uri=uri or f"http://{s.milvus_host}:{s.milvus_port}")

    def has_collection(self) -> bool:
        return self._client.has_collection(self.collection)

    def ensure_collection(self) -> str:
        """collection 不存在则创建(幂等)。"""
        if not self.has_collection():
            self._client.create_collection(
                collection_name=self.collection,
                dimension=self.dim,
                metric_type=METRIC_TYPE,
                auto_id=False,  # chunk id 由 PostgreSQL 序列决定
            )
        return self.collection

    def upsert_chunks(self, rows: list[dict]) -> int:
        """写入/更新向量。

        Args:
            rows: [{"id": chunk_id, "vector": [float, ...]}, ...]

        Raises:
            ValueError: 向量维度与配置不一致。
        """
        if not rows:
            return 0
        self.ensure_collection()
        for r in rows:
            if len(r["vector"]) != self.dim:
                raise ValueError(
                    f"向量维度 {len(r['vector'])} 与配置 embedding_dim={self.dim} 不一致,"
                    "请检查 embedding 模型是否与 EMBEDDING_DIM 匹配"
                )
        self._client.upsert(collection_name=self.collection, data=rows)
        self._client.flush(collection_name=self.collection)  # 强制落盘,保证立刻可检索
        return len(rows)

    def search(self, query_vector: list[float], top_k: int = 5) -> list[dict]:
        """余弦检索,返回 [{"id": chunk_id, "distance": 相似度}, ...] 按相似度降序。

        内容与来源不在此处返回(存 PostgreSQL),检索为空时返回空列表。
        """
        self.ensure_collection()
        if not query_vector:
            return []
        res = self._client.search(
            collection_name=self.collection,
            data=[query_vector],
            limit=top_k,
            search_params={"metric_type": METRIC_TYPE},
        )
        hits = res[0] if res else []
        return [{"id": h["id"], "distance": h["distance"]} for h in hits]

    def drop(self) -> None:
        """删除整个 collection(仅测试/重建用)。"""
        if self.has_collection():
            self._client.drop_collection(self.collection)
