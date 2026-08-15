# MindHarbor — AI 心理咨询与情感陪伴助手 架构设计文档

| 项目 | 内容 |
|---|---|
| 版本 | v1.0 |
| 日期 | 2026-08-14 |
| 状态 | 待评审 |
| 上游文档 | `AI心理咨询和情感陪伴助手.md`(项目概要设想) |

---

## 1. 项目概述

### 1.1 背景与目标

面向**大学生**的日常情绪倾诉、压力疏导、陪伴交流与心理资源查询场景,构建具备**情绪识别、知识库问答、多轮对话、风险提示、咨询师端管理**能力的 AI 情感陪伴助手。

项目同时承载课程教学目标:训练学生的大模型对话设计、RAG 知识检索、Agent 工具调用、前后端开发与用户状态管理能力。

### 1.2 用户与场景

| 角色 | 场景 |
|---|---|
| 学生(学生端) | 文字倾诉、做呼吸练习、检索心理资源、查看历史会话与收藏 |
| 管理员(管理端) | 咨询师 / 学生 / 心理资源的增删改查(CRUD 数据管理) |
| 咨询师(咨询师端) | 会话记录质检(尤其风险会话)、查看学生情绪日记与情绪趋势、形成心理档案 |
| 游客(可选) | 未登录体验基础聊天能力 |

### 1.3 能力范围(与概要文档任务映射)

| 概要任务 | 本设计对应 |
|---|---|
| 任务 1:心理科普知识库入库与检索 | §4.2 RAG 知识库模块 |
| 任务 2:情绪识别与对话陪伴 | §4.1 对话与情绪识别模块 |
| 任务 3:陪伴 Agent(7 项工具能力) | §4.3 Agent 模块 |
| 任务 4:学生端前端(聊天/练习/收藏/历史) | §4.5 学生端前端 |
| 任务 5(拆分):管理端(admin CRUD)+ 咨询师端(学生心理管理/会话质检) | §4.6 管理端、§4.7 咨询师端 |

---

## 2. 技术选型

| 层次 | 选型 | 理由 |
|---|---|---|
| 后端 | Python + FastAPI(统一后端) | LLM/RAG/Agent 生态最成熟;异步原生,天然支持 SSE 流式聊天;一门语言覆盖全后端 |
| 大模型接入 | 云端 LLM API(DeepSeek / 通义千问 / 智谱 GLM 任选) | 稳定、快、支持 function calling 与流式;课程项目有免费额度 |
| 模型适配层 | 自研 `adapters/` 抽象(LLM / Embedding / TTS) | 统一接口,后续可切换本地 Ollama 或更换供应商 |
| 数据库 | PostgreSQL(业务)+ Milvus v3.0.0(向量) | 业务与向量分离;Milvus 部署于本机 Docker,端口 19530 |
| 前端 | React + Vite(学生端 / 管理端 / 咨询师端三角色入口) | 生态大;配合 React Query + Zustand 轻量状态管理;三角色共用后端 API 与登录态 |
| 认证 | JWT + 角色权限中间件 | 支持 学生/咨询师/管理员 三角色 |
| 部署 | 单机 + 可选 docker-compose | 面向课程演示,一键起服务 |

### 2.1 设计约束

- **三角色前端**:学生端、管理端(admin CRUD)、咨询师端(counselor)为三个角色入口,共用后端 API 与登录态,按角色路由隔离;管理端与咨询师端作为两个独立任务实施。
- **模块化单体**:单进程 FastAPI,按领域分层,模块边界清晰、可独立测试,未来可平滑拆分微服务(课程项目不追求微服务形态)。
- **Agent 轻量自研**:不使用 LangGraph 等重框架,自建工具注册表 + function-calling 循环,保证教学透明性。

---

## 3. 总体架构

系统采用**三角色前端 + 单一后端**结构:学生端、管理端(admin CRUD)与咨询师端(counselor)是三个角色入口(同一 React 工程内按角色路由),共用登录态与后端 API;后端为单进程 FastAPI 模块化单体,统一承载业务服务、AI 编排(RAG/Agent/对话/记忆)与数据存储。

### 3.1 架构分层

```
┌───────────────────────────────────────────────────┐
│ 前端(React + Vite,三个角色入口)                           │
│ 学生端 SPA: 聊天 / 练习 / 收藏 / 历史                        │
│ 管理端 SPA(admin): 咨询师 / 学生 / 资源 CRUD                │
│ 咨询师端 SPA(counselor): 学生心理 / 会话质检                  │
│ (JWT + 角色路由,共用登录态)                                │
└────────────────────────┬──────────────────────────┘
                   REST + SSE 流式聊天
┌────────────────────────▼──────────────────────────┐
│  FastAPI 后端(模块化单体)                            │
│                                                    │
│  API 层  /api/v1/chat /emotions /journals           │
│          /resources /breathing /reminders           │
│          /favorites /admin/*                        │
│                                                    │
│  业务服务层  会话 / 情绪 / 日记 / 资源 / 用户 / 收藏 / 提醒 │
│                                                    │
│  AI 编排层  情绪分析 → 风险筛查 → 对话(记忆管理)→日记生成│
│             → Agent 循环(工具注册表+function calling)  │
│                                                    │
│  工具集(7个)  record_emotion / search_knowledge       │
│             generate_breathing / create_reminder    │
│             recommend_resources / query_emotion_stats│
│             (SQL Agent) / speak_voice (TTS)         │
│                                                    │
│  基础设施层  PostgreSQL + Milvus / 模型适配器        │
│             (LLM·Embedding·TTS) / 日志 / 风险告警      │
└────────────────────────────────────────────────────┘
```

### 3.2 关键设计原则

1. **边界清晰**:AI 能力(对话/RAG/Agent)封装在 `ai/` 层,不侵入业务服务;业务服务只通过接口调用。
2. **防幻觉优先**:专业内容必须走 RAG 引用,检索不到则明确说明,禁止编造。
3. **安全兜底**:风险话术即时触发、SQL Agent 只读白名单、角色权限隔离。
4. **教学透明**:工具、提示词、上下文拼接均显式可见,便于课堂讲解与调试。

### 3.3 典型请求链路示例

**学生发送一条倾诉消息:**

1. `POST /api/v1/chat`(SSE 流式)
2. 鉴权 → 归属到(或新建)`sessions`
3. 情绪识别:结构化 JSON(情绪类别 / 强度 / 压力来源 / 支持需求)
4. 风险筛查:命中 → 立即返回风险模板并标记会话
5. 触发记忆管理模块 `memory.py`:组装上下文(短期窗口最近 N 轮 + 会话摘要 + 长期画像)
6. 构建系统提示词(角色 / 边界 / 回复模板)→ Agent 循环:
   - LLM 可能调用 `record_emotion`(落库)、`search_knowledge`(引用来源)
7. 流式返回回复文本 + 工具卡片数据
8. 情绪日记生成:LLM 基于本轮聊天生成日记条目 → 结构化情绪记录写入 `emotions`(挂 `journal_id`)
9. 落库 `messages`;`memory.py` 更新短期窗口与会话摘要,沉淀长期记忆

---

## 4. 模块设计

### 4.1 对话与情绪识别模块(任务 2)

**子模块:**

- **情绪识别器 `emotion.py`**:独立轻量调用,输出结构化 JSON:
  `{emotion: 类别, intensity: 0-10, stress_source: 来源, support_need: 需求}`。
  类别枚举建议:`[anxious, sad, angry, lonely, tired, calm, hopeful]`。
- **风险筛查器**:危机关键词库 + LLM 判定双重保障;命中后触发**风险回复模板**(温和、明确,给出危机热线与校园求助渠道),并把会话 `risk_level` 置高、后台置顶。
- **情绪日记生成器 `journal.py`**:基于聊天内容由 LLM 生成情绪日记条目(摘要 + 结构化情绪记录),与情绪识别共用一次模型调用输出。
- **对话上下文记忆管理模块 `memory.py`**:统一管理对话记忆——短期记忆(最近 N 轮滑动窗口)、会话摘要(长会话压缩)、长期记忆/用户画像(历史沉淀)。由 `dialogue.py` 每轮对话前触发读取、每轮后触发更新。
- **对话控制器 `dialogue.py`**:编排对话主流程——触发 `memory.py` 组装上下文(短期窗口 + 会话摘要 + 长期画像)、切换情绪状态对应的回复模板、执行流式输出,并驱动日记生成与记忆更新。

**闭环数据链(文字聊天 → 情绪日记 → 情绪记录 → 情绪趋势):**

```
用户文字聊天消息
      │
      ▼
LLM 情绪识别 + 日记生成(一次调用,结构化输出)
      │   产出:{日记摘要, 情绪类别, 强度, 压力来源, 支持需求}
      ▼
写入情绪日记 journals(摘要 + mood_score)
      ├──→ 提取情绪记录写入 emotions(挂 journal_id / session_id)
      ▼
情绪趋势服务聚合 emotions → 咨询师端 ECharts 趋势图
```

- **触发时机**:情绪记录**仅在 LLM 生成情绪日记时一并产出**(与日记同一次模型调用,原子落库 `emotions`);默认**会话结束时生成一篇完整日记**,也可配置为每轮追加摘要。**不设手动打卡**,情绪数据全部来自对话闭环。
- 对话模块与 Agent 的 `record_emotion` 工具写入同一张 `emotions` 表,数据口径统一,避免重复。

**对话上下文记忆管理(`memory.py`):**

| 记忆层次 | 内容 | 存储 | 读写时机 |
|---|---|---|---|
| 短期记忆 | 当前会话最近 N 轮消息(滑动窗口) | `messages` | 每轮对话前读取、后写入 |
| 会话摘要 | 长会话的压缩摘要(话题 / 情绪走向 / 待办) | `sessions.summary` | 每轮结束或每 N 轮触发更新 |
| 长期记忆 / 画像 | 用户长期事实、偏好、过往压力源与支持需求 | `user_memories` + `emotions` 聚合 | 对话中识别到重要信息时沉淀,对话前召回注入 |

- `dialogue.py` 每次生成回复前调用 `memory.py.assemble_context()` 拉取三层记忆并拼接提示词,保证长期重要信息(如用户提过的考试压力、失眠)跨会话被记住,无需重复描述。
- **隐私约束**:仅沉淀对话中明确且非敏感的信息;风险或敏感内容不进入长期记忆,只做会话标记。
- 与 Agent 工具 `record_emotion` / `query_emotion_stats` 共用 `emotions` 数据,画像口径一致。

**系统提示词固化边界(示例语义)**:
> 你是校园情感陪伴助手,非心理咨询师,不作诊断、不开药、不替代专业求助;语气温和、回应清晰、设置合理边界;专业建议必须引用知识库来源。

### 4.2 RAG 知识库模块(任务 1)

**内容域**:心理常识 / 校园咨询流程 / 常见压力情境 / 自助练习资料。

**切片优化 —— 标题层级感知 + 父子分块(Small-to-Big)**(2026-08-15 更新):

```
文档 → 按 markdown 标题树切「节」(父块,不向量化)
     → 节内子块注入 [文档 > 节] 上下文前缀,Embedding 向量化 → 写 Milvus
     → 子块 parent_id 关联父块(整节文本存 PostgreSQL)
```

- 子块(小)用于向量检索(精确);命中子块后**回查父块**作为 LLM 上下文(完整),避免块内缺失标题语境。

**查询优化 —— RRF 混合检索**(2026-08-15 更新):

```
问题 → 提取关键词(连续 CJK/英文) → ILIKE 精确匹配(子块)
     → Milvus 向量检索 top-2k
     → Reciprocal Rank Fusion 融合排序(关键词加权 1.5)
     → 命中子块 → 回查父块上下文 → LLM 生成(带引用)→ 前端"参考来源"卡片
```

- RRF(倒数排名融合)比简单"关键词前置"更稳健:两路结果按排名加权合并,同分时关键词优先。
- `ChunkHit` 携带 `context`(父块文本),注入对话上下文(`memory.assemble_context` 优先使用)。

**入库工具**:`python scripts/ingest_knowledge.py` 批量入库 `data/knowledge/*.md`(含 `parent_id`/`is_parent` 字段)。

**防幻觉规则**:
- 检索为空 → 明确回复"资料库暂未收录该话题,建议预约校内咨询",不编造。
- 引用必须带来源(chunk 文档 id / 标题),前端展示来源卡片。

### 4.3 Agent 模块(任务 3)

**编排层 `agent.py`**:
- 工具注册表:`{name, description, input_schema, handler}`,可增量扩展。
- function-calling 循环:消息 → LLM 决定调用 → 执行 handler → 结果回填 → 继续 / 结束。
- 每步工具调用返回结构化结果,前端渲染为对应卡片。

**工具清单(7 项)**:

| 工具 | 作用 | 前端呈现 | 依赖 |
|---|---|---|---|
| `record_emotion` | 写入情绪记录 | 情绪确认卡片 | emotions 表 |
| `search_knowledge` | 调 RAG 检索 | 引用来源卡片 | RAG 模块 |
| `generate_breathing` | 呼吸练习分步引导 | 分步引导卡片 | 内置模板 |
| `create_reminder` | 创建日程提醒 | 提醒确认卡片 | reminders 表 |
| `recommend_resources` | 按情绪/需求推荐资源 | 资源卡片 | resources 表 |
| `query_emotion_stats` | SQL Agent:自然语言→SQL→只读执行→解释 | 趋势/统计卡片 | emotions 表 |
| `speak_voice` | 流式语音陪伴(TTS) | Audio 流式播放 | TTS 适配器 |

### 4.4 情绪数据与用户画像(支撑任务 4/5)

- **数据闭环**:`journals`(LLM 自动生成的情绪日记)与 `emotions`(结构化情绪记录)由对话模块联动产出,链路见 §4.1;**不设手动打卡,情绪数据全部来自日记生成**。
- `emotions` 表持续累积 LLM 日记生成的情绪,`journal_id` 关联来源日记,`session_id` 关联来源会话;数据仅由对话闭环生成,学生端不可修改。
- **长期画像**:`user_memories` 沉淀用户长期事实与偏好,由记忆管理模块维护,用于跨会话上下文(见 §4.1)。
- **情绪趋势**:按日/周聚合 `emotions` 的类别与强度,**咨询师端** ECharts 渲染;趋势图与日记联动,可下钻查看对应日记(用于学生心理管理)。
- **情绪档案**:咨询师端按学生汇总,展示情绪变化曲线、日记记录与高危标记。

### 4.5 学生端前端(任务 4)

| 页面 | 说明 |
|---|---|
| 聊天页 | SSE 流式消息、工具卡片、引用来源、输入建议;会话结束展示 LLM 生成的日记卡片 |
| 常用练习 | 呼吸/放松练习入口与引导 |
| 收藏回复 | 收藏的对话消息列表 |
| 历史会话 | 按会话查看历史消息 |

> 注:情绪日记与情绪趋势的**查看**功能移入咨询师端(§4.7)。

**技术要点**:`React Query` 管理服务端状态;`Zustand` 管理本地 UI 状态;SSE 用 `EventSource`/fetch 流式读取逐 token 渲染。

### 4.6 管理端(admin CRUD 数据管理)

| 模块 | 说明 |
|---|---|
| 咨询师管理 | 咨询师资料、专长领域、可预约信息(CRUD) |
| 学生用户管理 | 学生账号、风险标记(CRUD/检索) |
| 心理资源管理 | 资源卡片录入/上下架(CRUD) |

**权限**:`admins`(全部 CRUD);该任务为纯数据管理入口,不涉及学生心理数据查看。

### 4.7 咨询师端(counselor 前端)

| 模块 | 说明 |
|---|---|
| 会话记录管理 | 会话列表、消息回放、**风险会话置顶质检** |
| 学生心理管理 | 按学生查看**情绪日记**(LLM 生成,可溯源性)与**情绪趋势**(ECharts),下钻档案详情,形成学生心理档案 |

**权限**:`counselors`(学生、会话、日记、趋势只读 + 质检)/ `admins`(兼具全部权限)。

---

## 5. 数据库设计

### 5.1 核心表(PostgreSQL)

| 表 | 关键字段 |
|---|---|
| `users` | id, role(student/counselor/admin), name, username, password_hash, created_at |
| `counselors` | id, user_id, title, specialty, bio |
| `resources` | id, title, type, content, url, is_active |
| `sessions` | id, user_id, title, summary, started_at, risk_level(low/medium/high), status |
| `messages` | id, session_id, role, content, emotion_tags, tool_cards(json), is_favorite, created_at |
| `emotions` | id, user_id, journal_id, session_id, category, intensity, stress_source, support_need, created_at |
| `journals` | id, user_id, session_id, summary, content, mood_score, created_at |
| `favorites` | id, user_id, message_id |
| `reminders` | id, user_id, content, remind_at, done |
| `user_memories` | id, user_id, memory_type(profile/fact/preference), content, importance, source, created_at, updated_at |
| `knowledge_docs` | id, title, source, content_type, meta |
| `knowledge_chunks` | id, doc_id, content, seq, parent_id(自关联), is_parent(父子分块;子块向量存 Milvus collection,按 chunk id 关联) |

### 5.2 数据关系(简图)

```
users 1─∞ sessions 1─∞ messages 1─0..1 favorites
users 1─∞ sessions 1─0..1 journals(会话聚合日记)
journals 1─0..∞ emotions(日记驱动情绪记录)
users 1─∞ emotions / reminders
users 1─∞ user_memories(长期记忆沉淀)
users 1─1 counselors(咨询师)
resources(独立)
knowledge_docs 1─∞ knowledge_chunks(Milvus 向量检索)
```

### 5.3 SQL Agent 安全策略

- 使用**独立只读数据库连接**,强制 `SET TRANSACTION READ ONLY`。
- 语句白名单:仅允许 `SELECT`,且只允许访问 `emotions`、`sessions`、`messages` 等授权表;禁止 `INTO OUTFILE`、多语句、注释混淆等。
- 对生成 SQL 做 AST 解析校验后再执行;失败则返回友好提示,不暴露内部错误。

---

## 6. 安全、隐私与边界

| 维度 | 措施 |
|---|---|
| 认证授权 | JWT + 角色权限中间件;咨询师端接口二次校验 |
| SQL 注入 | 见 §5.3 只读连接 + 白名单 + AST 校验 |
| 隐私 | 会话/情绪数据仅本人、咨询师、管理员可见;咨询师端展示前脱敏(可选) |
| 风险兜底 | 危机话术即时响应,热线/校园渠道明确给出;会话高风险标记 |
| 模型安全 | 系统提示词固化不诊断、不替代专业求助、不编造专业的边界 |
| 密钥管理 | API Key 存环境变量/配置文件,不提交仓库 |

---

## 7. 部署与演示

**本地单机**:
1. 启动 PostgreSQL(本地或 docker `postgres` 镜像);Milvus v3.0.0 已部署于本机 Docker(端口 19530),无需再启动。
2. 后端:`uvicorn app.main:app --reload`(含建表、种子数据脚本)。
3. 前端:`vite dev` 或 build 后静态部署。

**可选 docker-compose**:一键编排 `postgres + backend + frontend`。

**演示闭环**:
```
登录 → 聊天(倾诉,自然触发:知识检索 → 呼吸练习 → 资源推荐 → 自动生成情绪日记)
→ 学生端:查看历史会话与收藏、常用练习
→ 管理端:录入咨询师 / 学生 / 心理资源(CRUD)
→ 咨询师端:查看学生情绪日记与情绪趋势 → 质检风险会话 → 形成学生心理档案
→ 咨询师端质检风险会话 → 查看学生情绪档案
```

---

## 8. 项目目录结构

```
proj/
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI 入口
│   │   ├── api/               # 路由层(chat/emotions/journals/resources/...)
│   │   ├── services/          # 业务服务层
│   │   ├── ai/                # 对话 / 情绪 / agent / tools / rag
│   │   │   ├── dialogue.py
│   │   │   ├── emotion.py
│   │   │   ├── journal.py
│   │   │   ├── memory.py
│   │   │   ├── agent.py
│   │   │   ├── tools/         # 7 个工具
│   │   │   └── rag/           # ingest / search
│   │   ├── models/            # SQLAlchemy 模型
│   │   ├── schemas/           # Pydantic
│   │   ├── core/              # 配置 / 安全 / 日志 / 依赖
│   │   └── adapters/          # LLM / Embedding / TTS 适配器
│   ├── scripts/               # 建表 / 知识库入库 / 种子数据
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── student/       # 学生端页面(聊天/练习/收藏/历史)
│   │   │   ├── admin/         # 管理端页面(咨询师/学生/资源 CRUD)
│   │   │   └── counselor/     # 咨询师端页面(学生心理/会话质检)
│   │   ├── components/        # 聊天 / 卡片 / 图表
│   │   ├── api/               # axios + SSE 封装
│   │   ├── stores/            # Zustand
│   │   └── router/            # 角色路由(学生/咨询师)
│   └── package.json
├── docs/                      # 设计文档 / 演示脚本
└── docker-compose.yml         # 可选
```

---

## 9. 实施里程碑(映射概要任务)

| 里程碑 | 内容 | 对应 |
|---|---|---|
| M1 | 脚手架:后端分层 + PostgreSQL 建表 + JWT 认证 + 前端骨架 | 基础 |
| M2 | 知识库入库管道 + RAG 在线检索 + 引用展示 | 任务 1 |
| M3 | 对话主流程 + 情绪识别 + 风险筛查 + 回复模板 + 上下文记忆管理 + 情绪日记自动生成闭环(聊天→日记→趋势) | 任务 2 |
| M4 | Agent 编排 + 7 项工具(含 SQL Agent、TTS) | 任务 3 |
| M5 | 学生端页面(聊天/练习/收藏/历史)+ SSE 流式 | 任务 4 |
| M6 | 管理端(admin CRUD):咨询师 / 学生 / 资源数据管理 | 任务 5a |
| M7 | 咨询师端:会话质检 + 学生心理管理(日记/趋势/档案) | 任务 5b |
| M8 | 集成联调、演示流程、日志与部署 | 系统集成 |

---

## 10. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| 云端 API 限流/欠费 | 演示中断 | 模型适配层 + 本地 Ollama 兜底切换 |
| SQL Agent 生成错误 SQL | 查询失败 | 只读连接 + AST 校验 + 友好报错重试 |
| RAG 检索质量差 | 回答不可靠 | 分块策略调优 + 混合检索 + 重排 |
| 流式与 function calling 并存复杂度 | 编排 bug | Agent 循环逐步日志化,前端按卡片类型降级渲染 |
| 隐私合规顾虑 | 教学展示 | 数据脱敏选项 + 明确仅用于课程演示 |

---

## 附录 A:工具 schema 示例

```json
{
  "name": "search_knowledge",
  "description": "在心理科普知识库中检索内容并返回带来源的引用",
  "input_schema": {
    "type": "object",
    "properties": {
      "query": { "type": "string", "description": "检索问题" }
    },
    "required": ["query"]
  }
}
```

```json
{
  "name": "record_emotion",
  "description": "记录用户当前情绪与压力来源,用于情绪档案与趋势",
  "input_schema": {
    "type": "object",
    "properties": {
      "category": { "type": "string", "enum": ["anxious","sad","angry","lonely","tired","calm","hopeful"] },
      "intensity": { "type": "integer", "minimum": 0, "maximum": 10 },
      "stress_source": { "type": "string" },
      "support_need": { "type": "string" }
    },
    "required": ["category", "intensity"]
  }
}
```

## 附录 B:风险回复模板示意

> 我注意到你现在可能很难受。请先做几个深呼吸——你并不孤单,有很多方式可以帮你度过这一刻。
> 建议你尽快联系身边的支持力量:危机干预热线 **400-161-9995**,或校内心理咨询中心(工作时间可直接预约)。
> 如果你有伤害自己的想法,请务必立刻联系以上渠道,也可以直接告诉我,我陪着你,但专业帮助更重要。
