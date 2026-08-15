# MindHarbor 项目进展

> **格式约定**(AGENTS.md 要求):每个任务/commit 完成后,在「进行中/已完成」小节追加一条:日期、任务名、完成内容、涉及文件/接口、测试结果、commit hash、评审结论、遗留问题。

## 当前里程碑

- M1 脚手架 + 数据模型 + JWT ✅ 完成
- M2 RAG 知识库 ✅ 完成
- M3 对话主流程 + 情绪日记闭环 🔧 实现完成,评审 Approved,1 个 Important 待修复
- M4 Agent 编排 + 7 工具 ⏳ 未开始
- M5–M8 前端与集成 ⏳ 未开始

## 进行中

### 2026-08-15 · Task 5 修复轮(error 事件测试覆盖)

- **内容**:评审发现 Important——`error` 事件路径零测试覆盖;另需处理空白内容孤儿会话、error payload 异常原文泄露两个 Minor。
- **状态**:修复 agent 被手动停止,待继续。
- **commit**:待提交。

## 已完成

### 2026-08-15 · Task 5 对话主流程 + 情绪日记闭环(M3)

- **内容**:`app/adapters/llm.py`(stream_chat/complete_json/complete_text,key 缺失抛清晰错误);`app/ai/emotion.py`(情绪识别 + 13 词危机关键词快通道 + LLM 风险判定);`app/ai/memory.py`(短期窗口 ≤10 轮 / 会话摘要 / UserMemory 长期画像,assemble_context 四级拼接);`app/ai/journal.py`(LLM 一次调用产出日记+情绪,原子写 Journal+Emotion,Emotion 写入唯一路径);`app/ai/dialogue.py` + `app/api/chat.py`(POST /api/v1/chat SSE 流)。
- **SSE 事件格式**:`data: {"type": "text"|"tool_card"|"journal"|"error", "payload": {...}}\n\n`。
- **测试**:35 passed(基线 23 + 新增 12,全部 monkeypatch LLM/RAG,零真实 API)。
- **commit**:`5e75f75` `feat: dialogue loop with emotion journal chain`
- **评审**:Approved(Spec ✅,铁律核验通过);Important 1 项(error 事件无测试)+ Minor 7 项(已记 SDD ledger 延迟处理)。

### 2026-08-15 · Task 4 RAG 知识库(M2)

- **内容**:`app/adapters/embedding.py`(OpenAI 兼容 /embeddings);`app/ai/rag/{chunking,ingest,milvus,search}.py`(段落+固定窗口分块;PG 存 chunk 元数据 + Milvus 存向量按 chunk id 关联;MilvusStore 封装 MilvusClient,COSINE/1024 维);`scripts/ingest_knowledge.py` + `data/knowledge/*.md` 样例语料。
- **接口**:`ingest_document(path) -> int`、`search(query, top_k=5, keyword=None) -> list[ChunkHit]`、`ChunkHit(text, doc_title)`、`MilvusStore`。
- **测试**:23 passed(基线 8 + 新增 15);测试用独立 `knowledge_chunks_test` collection 每测建删,不污染生产 collection;真实 embedding 链路已实测。
- **commit**:`4bf559e` `feat: RAG ingest and Milvus vector search`
- **评审**:Approved;Minor 4 项(已记 SDD ledger 延迟处理)。

### 2026-08-15 · 向量库迁移:pgvector → Milvus v3.0.0

- **内容**:向量检索改 Milvus(本机 Docker,端口 19530);`KnowledgeChunk` 去向量列改纯元数据;config/.env 增 MILVUS_*;requirements 换 pymilvus;init_db/conftest 简化;全部文档(设计/计划/AGENTS/README)同步更新。
- **commit**:`1475f39` `refactor: switch vector store from pgvector to Milvus v3.0.0 (docker:19530), update docs`

### 2026-08-15 · M1:数据模型 + 建表 + JWT 认证

- **内容**:12 张表(users/counselors/sessions/messages/favorites/emotions/journals/resources/reminders/knowledge_docs/knowledge_chunks/user_memories);`scripts/init_db.py` + `scripts/seed.py`(三角色账号 + 咨询师 + 4 资源);JWT 认证(`/api/v1/auth/login`、`/auth/me`、`get_current_user`、`require_roles` 角色守卫)。
- **宿主 PostgreSQL 18.4**:已创建 `mindharbor` 用户 + `mindharbor`/`mindharbor_test` 两库。
- **测试**:8 passed(模型 CRUD、日记↔情绪关联、登录成功/失败、token 校验)。
- **commit**:`94a4815` `feat: add SQLAlchemy models, init_db/seed scripts, JWT auth with tests`

### 2026-08-15 · CORS 与团队网络

- **内容**:CORS 放开为 `["*"]`(团队开发);后端绑定 `0.0.0.0`;开发机虚拟局域网地址 **172.16.2.91** 写入 AGENTS.md/README;前端 vite 代理可配置(`VITE_PROXY_TARGET`)。
- **commit**:`570120e`(CORS)、`8d051f8`(局域网地址与代理配置)

### 2026-08-15 · 脚手架 + 设计文档 + 团队约定

- **内容**:git init;backend/frontend 目录框架;`.gitignore`/`.env(.example)`/config/requirements/docker-compose/README;设计文档(`docs/superpowers/specs/2026-08-14-mindharbor-design.md`);实施计划(`docs/superpowers/plans/2026-08-14-mindharbor-implementation.md`,M1–M8);AGENTS.md(团队协作约定,CLAUDE.md 软链接)。
- **commit**:`8cb37c3`、`66d2d18`、`fe190fc`

## 关键决策记录(Rulings)

1. 三角色前端(学生/管理/咨询师)+ 单一后端;咨询师端归类前端,管理端与咨询师端拆两个任务。
2. 情绪记录只在 LLM 生成日记时产出(`journal.py` 为唯一写入路径);学生端不可查看/修改日记与情绪;无手动打卡。
3. 向量库用 Milvus v3.0.0(放弃 pgvector);chunk 元数据 PG + 向量 Milvus 按 chunk id 关联。
4. SSE 事件统一 `{"type": "text|tool_card|journal|error", "payload": {...}}`。
5. CORS 开发期放开 `["*"]`;生产收紧白名单。

## 遗留问题(TODO)

- Task 5 Important:error 事件路径零测试覆盖(修复被停止,待继续)。
- SDD ledger 中 Task 4/5 的 deferred Minor 清单(见 `.superpowers/sdd/2026-08-14-mindharbor-implementation/progress.md`)。
- 危机热线为示例号码,演示前替换为当地真实热线。
