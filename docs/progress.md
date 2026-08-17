# MindHarbor 项目进展

> **格式约定**(AGENTS.md 要求):每个任务/commit 完成后,在「进行中/已完成」小节追加一条:日期、任务名、完成内容、涉及文件/接口、测试结果、commit hash、评审结论、遗留问题。

## 当前里程碑

- M1 脚手架 + 数据模型 + JWT ✅ 完成
- M2 RAG 知识库(Advanced RAG)✅ 完成
- M3 对话主流程 + 情绪日记闭环 ✅ 完成
- M4 Agent 编排 + 7 工具 ✅ 完成
- M5–M7 前端(学生端/管理端/咨询师端)🔵 **已移交前端团队**(2026-08-15:我方 `frontend/src` 实现已从仓库移除,保留脚手架配置;待团队 push 后合并)
- M8 集成联调与部署 ⏳ 未开始

## 进行中

(无)

### 心理资源入库(2026-08-15)

- 子代理搜索真实心理资源并入库 `resources` 表:`backend/scripts/seed_resources.py`(幂等,按 title 去重)。
- 新增 12 条:**书籍 4**(蛤蟆先生/也许你该找个人聊聊/被讨厌的勇气/正念的奇迹)、**文章 4**(澎湃/壹心理/WHO/央视网)、**游戏 4**(Celeste/GRIS/Spiritfarer/Florence);URL 全部真实可访问(豆瓣/Steam/权威媒体),`is_active=True`。
- 资源表现在 **14 条**。原占位资源清理(2026-08-15):删除"考前压力应对/478 呼吸练习";保留"危机干预热线/校园心理咨询预约流程"改为 `type=求助渠道`,`content` 取自知识文档(24h 热线/三种预约方式),`url=null`。全表 type 统一为中文:求助渠道 2 / 书籍 4 / 文章 4 / 游戏 4。

### 前端合并完成(2026-08-15)

- 团队成员分支 `feature/frontend-tri-role`(commit `d3fc2f0`)已 fast-forward 合并到 main:三角色前端(学生/管理/咨询师页面 + api/stores/styles,29 文件,5447 行)。
- 验证:`pnpm build` 通过(288KB);dev server 冒烟(首页 + /login 200);后端接口未变。
- 前端团队可基于 `docs/api.md` 契约继续迭代。

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

### 2026-08-15 · 手动结束会话接口 + 记忆管理完善

- **手动结束会话接口** `POST /api/v1/chat/sessions/{id}/end`:校验归属 → 幂等(已结束返回已有日记)→ `dialogue.finish_session`(情绪日志 Journal+Emotion 原子入库 → 会话 closed → 沉淀长期记忆)→ 返回日记载荷;SSE 流与专用端点共用 `finish_session`,情绪写入唯一路径不变。真机验证:结束→生成日记(`journal_id=3`)→幂等返回同一日记。
- **记忆管理完善**:
  - 长期记忆**依据情绪日志**:`_emotion_profile` 从 journals/emotions 聚合主情绪、**情绪趋势**(新旧强度对比)、常驻压力源/支持需求;会话结束 `settle_long_term_memory` 把稳定压力源(≥3 次)沉淀为 UserMemory(profile)。
  - 短期上下文记忆:**滚动会话摘要**——首次达阈值生成,之后每满阈值用 LLM 增量压缩「旧摘要 + 新增对话」。
- **测试**:74 passed(新增:手动结束生成日记/幂等/403、情绪画像趋势与压力源、稳定模式沉淀、滚动摘要增量)。
- **API 文档**:生成逻辑落成 `backend/scripts/gen_api_docs.py`(可复用),刷新 `docs/openapi.json`(12 paths)+ `docs/api.md`。
- **commit**:`2cd0311`(接口+记忆)、后续文档提交。

### 2026-08-15 · 咨询师端对话 Agent

- **独立工具集** `app/ai/counselor.py` + `counselor_tools.py`(counselor_registry,不污染学生端):
  - `query_student_stats`:SQL Agent(自然语言→只读 SQL→表格 headers/rows+解释),查任意学生/全体;白名单含 `users`;
  - `search_student_journals`:按学生姓名/用户名查情绪日记;
  - `find_at_risk_students`:识别情绪异常学生(近 N 天高强度负面情绪 / 高风险会话)。
- **接口** `POST /api/v1/counselor/chat`(SSE,`require_roles("counselor","admin")`):复用 `agent.run`(新增 `registry` 参数支持独立工具集);返回 `stats_table`(表格)/`at_risk_students`/`student_journals` 卡片 + 流式总结。
- **SQL 增强**:SQL_GEN_PROMPT 注入**表结构 hint**(防 LLM 臆造列名,如 `emotion_type`);SQL 结果 Decimal→float、日期→ISO(JSON 可序列化)。
- **真机验证**:counselor 登录 → "统计情绪分布" → Agent 调用 stats_table(表格)+ at_risk_students,流式专业总结;学生访问 403。
- **测试**:91 passed(新增 9:注册表 3 工具、SQL 表格/非法拒绝、异常识别、日记检索、接口权限 403、接口可用)。
- **契约/规约更新**:`docs/api.md` 重新生成(13 paths,含 counselor/chat);`AGENTS.md` 架构/职责/SQL 铁律补充咨询师端 Agent。
- 提交:`52973dc`。

### 2026-08-15 · Agent 工具意愿增强 + 多工具组合

- **TOOL_SYSTEM_PROMPT 更新**:提高 `speak_voice` 与 `recommend_resources` 调用意愿(孤单/难过/资源需求主动调用);规则 5 放开"最多一个工具"→ **允许一次对话依次/同时调用多个工具**(如 search_knowledge + speak_voice、recommend_resources + speak_voice)。
- **agent.run 支持一轮多 tool_call**:循环内遍历 `tool_calls` 全执行(原只取第一个),消息与 tool_call_id 一一回填。
- **工具 description 强化**:speak_voice("回复适合朗读安抚时也主动调用")、recommend_resources("提及或可能受益于资源即推荐,并附 URL")。
- **真机验证**:混合意图("想看点治愈的东西 + 温柔声音安慰")→ Agent 同时产出 `resources` + `voice` 两张卡片,voice 真实合成(非降级)。
- **测试**:82 passed(新增:一轮多 tool_call 全执行)。
- 提交:`(待)`

### 2026-08-15 · CosyVoice TTS 修复

- **问题**:百炼 compatible-mode 不支持 OpenAI 兼容 `/audio/speech`(404);CosyVoice 需 DashScope SDK。
- **修复**:`adapters/tts.py` 改用 **dashscope `HttpSpeechSynthesizer`**(非流式);TTS_BASE_URL 为 compatible-mode 地址时自动派生 `/api/v1` 专属域名;`status_code==0` 视为成功(SDK 语义),`audio_url` 下载音频字节。
- **音色修正**:`Cherry` 非 qwen-audio-3.0-tts-flash 有效音色(引擎 411)→ 改为 `longanhuan_v3.6`(支持中文普通话)。
- **真机验证**:合成成功(87KB mp3);`speak_voice` 工具返回 base64 音频(67KB),不再降级文字卡片。
- **测试**:81 passed。依赖新增 `dashscope>=1.21`。
- 提交:`(待)`

### 2026-08-15 · RAG 收敛为 Agentic(按需检索)

- **问题**:dialogue 每轮自动 RAG 与 `search_knowledge` 工具重复(同一轮可能检索两次)。
- **收敛**:移除 dialogue 自动 RAG,**检索唯一入口 = Agent 的 `search_knowledge` 工具**(LLM function-calling 按需调用);工具卡片随助手消息持久化(`tool_cards`)。
- **提高工具倾向**:TOOL_SYSTEM_PROMPT 强指示"知识类问题必须调用 search_knowledge";工具决策 temperature 0.2→0.1。
- **查询词精炼**:`_refine_query` 去问句语气词/停用词(请问/我想/怎么办等),提取核心检索词再走 RRF 混合检索。
- **真机验证**:知识类问题("学校心理咨询中心怎么预约")→ Agent 自动调用工具 → knowledge 卡片(命中 3 条来源);普通对话零检索。
- **测试**:81 passed(新增:工具查询精炼断言、refine 函数;调整 dialogue 无自动 RAG 断言)。
- **前端契约变化**:`tool_card` 来源卡片类型由 `sources` 改为 `knowledge`(含 hits),且仅在 Agent 检索时出现——需同步前端团队。
- 提交:`(待)`

### 2026-08-15 · 历史会话接口变更:按状态分组 + 已结束不可续聊

- `GET /chat/sessions` 返回分组 `{active: [...], closed: [...]}`(进行中 / 已结束各 ≤50 条)。
- **后端状态校验**:`POST /chat` 携带已结束会话(`status=closed`)→ 400「会话已结束,只能浏览历史,无法继续对话」;已结束会话仍可 `GET .../messages` 浏览。
- 测试:14→16 项(分组、续聊被拒 400、已结束可浏览)。**前端适配已移交前端团队**(FavoritesHistory/Chat 需按分组结构改造)。
- 提交:`(待)`

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
