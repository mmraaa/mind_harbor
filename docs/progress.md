# MindHarbor 项目进展

> **格式约定**(AGENTS.md 要求):每个任务/commit 完成后,在「进行中/已完成」小节追加一条:日期、任务名、完成内容、涉及文件/接口、测试结果、commit hash、评审结论、遗留问题。

## 当前里程碑

- M1 脚手架 + 数据模型 + JWT ✅ 完成
- M2 RAG 知识库(Advanced RAG)✅ 完成
- M3 对话主流程 + 情绪日记闭环 ✅ 完成
- M4 Agent 编排 + 7 工具 ✅ 完成
- M5 学生端前端 ✅ 完成(分支 `feature/m5-student-frontend`)
- M6 管理端(admin CRUD)⏳ 未开始
- M7 咨询师端 ⏳ 未开始
- M8 集成联调与部署 ⏳ 未开始

## 进行中

(无)

## 已完成

### 2026-08-15 · Task 7 学生端前端(分支 feature/m5-student-frontend)

- **设计演进「夜航港湾」→「晨光港湾」**:初版深海夜冷色调,按用户要求反转为**暖色调**(2026-08-15 更新)——暖米 `#F7EFE2` 主底 + 日出橙 `#E8853B` 强调 + 雾蓝 `#5B8EA6` 冷暖对比;灯塔从深夜变日出,叙事一致;新增语义变量 `--on-accent`(强调底文字)、`--coral-text`(危机文字),清理全部硬编码浅色文字(浅底可读)。实测计算样式验证暖色生效、登录闭环正常。
- **设计「夜航港湾」(初版)**:深海夜 `#0B1D2A` + 灯塔暖光 `#F5B24A` + 珊瑚危机语义色;标题思源宋体/日记楷体;签名动效"呼吸波纹"(输入区同心圆,尊重 reduced-motion);灯塔 SVG 标识。
- **页面闭环**:登录/注册(注册即登录)→ 学生端导航(桌面侧栏/移动底部 tab)→ 聊天页(SSE 逐 token + 工具卡片:呼吸/来源/危机/日记/语音等 + 结束并生成日记)→ 情绪日记(列表 + 楷体详情)→ 收藏与历史(双 tab)→ 用户主页(退出)。
- **后端配套 API**(TDD,65→66 测试):`/auth/register`、`/chat/sessions`(+messages)、`/journals/mine`(+详情)、`/favorites` 增删查。
- **真机联调发现并修复 2 个真实 API bug**:① agent 循环漏 append 带 tool_calls 的 assistant 消息(DeepSeek 400);② 阿里云百炼 TTS 无 OpenAI 兼容 /audio/speech → 降级文字卡片(待单独适配 CosyVoice 异步 API)。
- **验证**:后端 66 tests 全绿;`pnpm build` 通过(167 模块);真实 LLM 全链路:Agent 工具调用(voice 降级卡片)→ 流式 text → RAG sources → journal 落库。
- **铁律变更**:学生可只读查看自己的日记(AGENTS.md 已同步)。
- **commits**:`d33a453`(学生 API)、`7f82757`(agent/TTS 修复)、`82754a6`(前端页面)、`dfba3f9`(暖色主题)。

**示例账号**(seed.py 种子):学生端 `student / student123`;咨询师端 `counselor / counselor123`;管理端 `admin / admin123`。

### 2026-08-15 · Advanced RAG 优化(切片 + 查询)

- **切片优化**:`chunking.py` 重写为**标题层级感知 + 父子分块(Small-to-Big)**——按 markdown 标题树切「节」(父块),子块注入 `[文档 > 节]` 上下文前缀进 Milvus,`parent_id` 关联父块;`knowledge_chunks` 表加 `parent_id`/`is_parent` 列。
- **查询优化**:`search.py` 改 **RRF 混合检索**——向量 top-2k + ILIKE 关键词(自动从 query 提取 CJK/英文词),Reciprocal Rank Fusion 融合(关键词加权 1.5);命中子块回查父块,`ChunkHit` 新增 `context` 字段,`memory.assemble_context` 优先用父块。
- **入库闭环**:`ingest_knowledge.py` 入库 5 篇官方文档 → 23 子块 + 父块;真实查询验证 4 类问题均语义精准命中(预约/考试焦虑/正念呼吸/联系方式),子块带节前缀、父块上下文完整。
- **测试**:68 passed(新增:标题感知分块、父块 context、RRF 关键词提升、父子关联入库)。
- **commit**:`2b3dc96` `feat: advanced RAG (section-aware parent-child chunking, RRF hybrid search), ingest official docs`

### 2026-08-15 · Task 6 Agent 编排 + 7 工具(M4)

- **内容**:`app/adapters/llm.py` 扩展 `chat_with_tools`(function-calling);新建 `app/adapters/tts.py`(OpenAI 兼容 `/audio/speech`);`app/ai/tools/registry.py`(ToolSpec + ToolRegistry 单例,7 工具注册);7 个工具:record_emotion(走 `journal.generate`,铁律:情绪只随日记落库)/ search_knowledge(RAG 检索)/ generate_breathing(3 套内置呼吸模板)/ create_reminder / recommend_resources / query_emotion_stats(SQL Agent)/ speak_voice(TTS → base64 音频卡片);`app/ai/agent.py` 工具决策循环(最多 3 轮,工具失败不中断,错误结果回填 LLM)。
- **SQL Agent 安全**:sqlglot AST 校验(单语句/SELECT/表白名单 `{emotions,journals,sessions}`)→ 注入 `WHERE user_id=<uid>`(聚合查询同样正确)→ LIMIT 100 → `SET TRANSACTION READ ONLY` 只读执行 → LLM 解释结果。
- **dialogue.py 集成**:RAG 检索后插入 agent 循环,tool_card 事件先于最终流式回复;工具结果注入最终回复上下文。
- **测试**:56 passed(40 基线 + 16 新增:注册表完整性、7 工具执行、SQL Agent 合法/非法 4 用例、agent 循环/无工具/最大轮数保护);全部 monkeypatch LLM/TTS,零真实 API;SQL Agent 执行 monkeypatch 测试库连接。
- **commit**:`be15848` `feat: agent orchestration with 7 tools`
- **工作方式**:主会话亲自 TDD 实现 + 亲自 review(按用户要求,不派子代理)。

### 2026-08-15 · Task 5 修复(error 事件测试覆盖)

- **内容**:Important 修复——`error` 事件路径补 5 个测试(空白内容 3 参数化 + 日记生成失败 + 流中途异常);空白内容在路由层 strip 校验、建会话前拒绝(消除孤儿会话行);`_finish_session` 与 chat 兜底异常改通用文案 `GENERIC_ERROR_MSG`,异常详情进日志不外泄。
- **Code-review**:主会话亲自审阅采纳(常量单一来源、测试断言覆盖 orphan-session/status/Journal 0 行/日志与 payload 隔离)。
- **测试**:40 passed(35 基线 + 5 新增)。
- **commit**:`2be79c5` `fix: add error event tests, guard blank input, sanitize error payload`

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

- **TTS 供应商适配**:阿里云百炼 CosyVoice 是异步任务 API,当前 `speak_voice` 降级为文字卡片;待单独实现 DashScope 语音合成适配。
- SDD ledger 中 Task 4/5 的 deferred Minor 清单(见 `.superpowers/sdd/2026-08-14-mindharbor-implementation/progress.md`)。
- 危机热线为示例号码,演示前替换为当地真实热线。
