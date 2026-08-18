# Task 4 报告:RAG 知识库(M2)

状态:**DONE**
提交:`feat: RAG ingest and Milvus vector search`
测试:`23 passed in 57.70s`(既有 8 个 + 新增 15 个,全绿)

## 创建的文件

| 文件 | 说明 |
|---|---|
| `backend/app/adapters/embedding.py` | Embedding 适配层(铁律:AI 模型访问只经 `app/adapters/`),OpenAI 兼容 `POST {base_url}/embeddings` |
| `backend/app/ai/rag/chunking.py` | 分块:按段落累积 + 固定窗口(带 overlap)切块 |
| `backend/app/ai/rag/ingest.py` | 入库管道:读取文档 → 分块 → PG 元数据 → 向量写 Milvus |
| `backend/app/ai/rag/milvus.py` | `MilvusStore`:`MilvusClient`(pymilvus 3.0.1)封装 |
| `backend/app/ai/rag/search.py` | 在线检索:query → embedding → Milvus 余弦 top-k → PG 回查来源(可选关键词混合) |
| `backend/scripts/ingest_knowledge.py` | 批量入库 `data/knowledge/*.md` |
| `backend/tests/test_rag.py` | 15 个测试(分块/入库/检索/Milvus/适配器),embedding 全 monkeypatch |
| `backend/data/knowledge/{考试焦虑,心理咨询流程,正念呼吸练习}.md` | 样例语料(脚本输入;brief 未列但目录为空,脚本无输入则无意义) |

## 公开接口

- `chunking.chunk_text(text, max_chars=500, overlap=50) -> list[str]` — 段落累积到窗口封块;单段超窗按固定窗口+overlap 切分;空文本返回 `[]`。
- `ingest.ingest_document(path, db=None, store=None) -> int` — 返回 chunk 数;标题取首个 `#` 标题(无则文件名);向量入库失败时回滚本次文档元数据,不留孤儿 chunk;embedding 失败时零写入。
- `milvus.MilvusStore(collection=None, dim=None, uri=None)` — 配置驱动,测试可注入独立 collection:
  - `ensure_collection()` — 幂等建 collection;
  - `upsert_chunks(rows: list[dict]) -> int` — `[{"id": chunk_id, "vector": [...]}]`,维度不符抛 `ValueError`,upsert 后 flush 保证立即可检索;
  - `search(query_vector, top_k=5) -> list[dict]` — 返回 `[{"id", "distance"}]` 降序,空检索返回 `[]`;
  - `drop()` — 测试清理用。
- `search.search(query, top_k=5, keyword=None, db=None, store=None) -> list[ChunkHit]` — 向量检索;`keyword` 非空时先做 PG ILIKE 关键词命中再按向量补足、去重、截 top_k;空白 query 返回 `[]`(防幻觉,不编造)。
- `search.ChunkHit(text, doc_title, chunk_id=None, score=0.0)` — dataclass;`doc_title` 供前端"参考来源"卡片。
- `adapters.embedding.embed(texts: list[str]) -> list[list[float]]` — 批量向量化;key/base_url/model 未配置时抛带配置项名的 `RuntimeError`。

## Milvus collection schema(生产 `knowledge_chunks`,Milvus v3.0.0)

- 字段:`id`(INT64,主键,auto_id=False,对应 PG `knowledge_chunks.id`)、`vector`(FLOAT_VECTOR,dim=1024)
- 度量/索引:`COSINE` + AUTOINDEX(state=Finished,已索引 3 行)
- 测试 collection:`knowledge_chunks_test`,每测试建/删,已清理(当前 `list_collections()` 仅剩 `knowledge_chunks`)

## 测试证据

```
23 passed in 57.70s   (8 既有 + 15 新增)
```

新增覆盖:分块(段落合并/超窗切分/空文本)、入库落 PG+Milvus 且返回计数、检索召回+来源标题正确、空 collection 与空白 query 返回空列表、关键词混合提升命中前置、Milvus 维度校验、embedding 请求形状(Bearer 头/URL/model)与未配置报错。全部 embedding 调用经 monkeypatch 假实现,不真实打 API。

## 实测(真实链路)

`python scripts/ingest_knowledge.py` 用真实 text-embedding-v3 入库 3 个文档、3 chunks;真实检索:
- `"最近要考试了,我特别焦虑失眠怎么办"` → 首条 `考试焦虑应对`(0.795)、`正念呼吸练习`(0.670)、`校内心理咨询预约流程`(0.523),排序合理;
- `keyword="危机"` → 危机热线 chunk 置顶(score 1.000);
- 空白 query → `[]`。

## 遗留问题 / 备注

1. **测试耗时 ~57s**:Milvus collection 生命周期操作每次 ~1.3s(建/删/刷),非代码问题;如嫌慢可改为 session 级复用 collection + 测间清数据,但会牺牲隔离性,故保留每测独立。
2. **flush 必要**:实测 pymilvus 3.0.1 + Milvus 3.0.0 在 upsert 后立即 search 会空结果,`upsert_chunks` 内 flush 已解决。
3. **分块粒度**:样例语料短(每文档 1 chunk),长文档按 500 字符/50 重叠切块,参数已可配置。
4. **chunk 内容含 `#` 标题行**(标题段落并入首块),属逐字保留,下游对话可自行截取。
5. **无相似度阈值**:检索恒返 top-k(不含关键词过滤),"未收录"话术由 Task 5 对话层依据空结果处理——与本任务"检索为空返回空列表"约定一致。
6. `.superpowers/sdd/.gitignore` 为 `*`,brief/report 不入库(既有约定,非本次改动)。
