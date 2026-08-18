### Task 4: RAG 知识库(M2)

**Files:**
- Create: `backend/app/ai/rag/chunking.py`、`ingest.py`、`search.py`、`milvus.py`(MilvusClient 封装);`backend/app/adapters/embedding.py`
- Create: `backend/scripts/ingest_knowledge.py`
- Test: `backend/tests/test_rag.py`

**Interfaces:**
- Consumes: `KnowledgeChunk`(Task 2)、`get_db`(Task 1)
- Produces: `ingest_document(path) -> int`(chunk 数)、`search(query: str, top_k=5) -> list[ChunkHit]`、`ChunkHit(text, doc_title)`。

- [ ] **Step 1: 分块 + 入库管道**

`chunking.py`:按段落+固定窗口切块;`ingest.py`:读取文档 → 分块 → chunk 元数据写 PostgreSQL `KnowledgeChunk`,`embedding.embed(texts)` 向量 + chunk id 写入 Milvus collection(`milvus.py` 封装 `MilvusClient.upsert`)。

- [ ] **Step 2: 在线检索**

`search.py`:query → embedding → `MilvusClient.search` 余弦 top-k → 按命中 chunk id 回查 PostgreSQL 取内容与来源 → 可选关键词混合 → 返回带来源的命中。

- [ ] **Step 3: 测试 + 脚本**

`test_rag.py`:灌入样例语料,断言检索召回与引用来源;`ingest_knowledge.py` 读取 `data/knowledge/*.md` 批量入库。

- [ ] **Step 4: 提交**

```bash
git commit -m "feat: RAG ingest and Milvus vector search"
```

---

