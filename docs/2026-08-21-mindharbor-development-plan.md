# MindHarbor — AI 心理咨询与情感陪伴助手 项目开发计划

| 项目 | 内容 |
|---|---|
| 文档编号 | MH-DEVPLAN-001 |
| 版本 | v1.0 |
| 日期 | 2026-08-21 |
| 状态 | 执行中(M1–M4 后端完成、M5–M7 前端已合并,待 M8 集成联调) |
| 关联文档 | 需求/架构:`docs/superpowers/specs/2026-08-14-mindharbor-design.md`;实施:`docs/superpowers/plans/2026-08-14-mindharbor-implementation.md`;接口:`docs/api.md`;规格:`docs/2026-08-20-mindharbor-course-spec.md`;进展:`docs/progress.md` |

---

## 1. 前言

### 1.1 目的

本文档描述 MindHarbor 课程项目的开发计划,用以指导项目的有序实施与团队协作,内容包括:项目范围与目标、利益相关人、开发生命周期与阶段划分、监控活动安排,以及测试工具与运行环境。供开发团队、前端协作团队与课程验收方共同使用。

### 1.2 术语与缩略语

| 术语/缩略语 | 说明 |
|---|---|
| MindHarbor | 本项目的名称(心港)——面向大学生的 AI 心理咨询与情感陪伴助手 |
| RAG | Retrieval-Augmented Generation,检索增强生成;本项目基于心理科普知识库向量检索 |
| Agent | 本项目自研的轻量 Agent 编排层:function-calling 循环 + 工具注册表(7 个工具) |
| SQL Agent | 把自然语言情绪统计问题转成只读 SELECT 并解释结果的工具能力 |
| SSE | Server-Sent Events,本项目聊天接口的流式输出协议(`data: {type,payload}` 事件流) |
| TTS / ASR | 文本转语音 / 语音识别 |
| JWT | JSON Web Token,本项目登录态与角色鉴权载体 |
| LLM | 大语言模型(云端 API,经 `app/adapters/` 统一接入) |
| Milvus | 开源向量数据库(v3.0.0,本机 Docker:19530),存知识库 chunk 向量 |
| WBS | Work Breakdown Structure,工作分解结构 |
| M1–M8 | 里程碑编号(见 §4.2 阶段划分) |

---

## 2. 项目概述

### 2.1 项目背景和目标

**背景**：面向大学生的日常情绪倾诉、压力疏导、陪伴交流与心理资源查询场景,构建具备情绪识别、知识库问答、多轮对话、风险提示、咨询师端管理能力的 AI 情感陪伴助手。项目同时承载软件工程课程教学目标:训练大模型对话设计、RAG 知识检索、Agent 工具调用、前后端开发与用户状态管理能力。

**目标**：

- **功能目标**：完成「文字聊天 → 情绪识别/风险筛查 → 上下文记忆管理 → 生成回复 → LLM 自动生成情绪日记 → 情绪趋势(咨询师端查看)」的完整数据闭环;提供学生端(聊天/练习/收藏/历史)、咨询师端(学生心理管理/对话质检/SQL 助手)、管理端(用户与资源 CRUD + AI 服务配置)三角色入口。
- **质量目标**：后端全量自动化测试通过(当前 125 用例全绿);前端 `tsc -b && vite build` 构建通过;演示闭环可在本机/校园网 5 用户并发下稳定运行。
- **教学目标**：Agent 工具注册表、提示词、上下文拼接均显式可见,便于课堂讲解;AI 能力全部经 `adapters/` 适配层,演示可一键切换供应商。

### 2.2 项目范围

**范围内**：

- 后端：FastAPI 模块化单体——认证与三角色权限、RAG 知识库、对话/情绪/日记/记忆闭环、Agent 编排 + 7 工具(含 SQL Agent、TTS)、咨询师端独立 Agent 工具集、管理端 CRUD 与 AI 服务配置、局域网镜像同步。
- 前端：React + Vite + TS 单工程内三角色路由(学生端/管理端/咨询师端)。
- 数据：PostgreSQL(业务)+ Milvus(向量);知识库文档与入库管道。

**范围外(明确不做)**：

- 语音**识别**(ASR)不做后端处理,语音讯息由语音模块完成识别后以 `voice_text` 文本进入统一评分/对话链路;
- 实时 IM/长连接推送(SSE 仅用于对话流);
- 生产级部署与高可用(仅面向课程演示);
- 简历、招聘等与企业招聘平台相关的功能(本项目为心理陪伴域)。

### 2.3 交付的产品

| 交付物 | 说明 | 位置 |
|---|---|---|
| 后端代码 | FastAPI 模块化单体(含 ai/rag/tools、admin_module) | `backend/` |
| 前端代码 | 三角色 React 工程(学生/管理/咨询师) | `frontend/` |
| 数据库脚本 | 建表(`init_db.py`)、种子数据(`seed.py`)、知识库入库(`ingest_knowledge.py`) | `backend/scripts/` |
| 接口契约 | 32 个端点的 OpenAPI 与人读文档 | `docs/api.md`、`docs/openapi.json` |
| 工程文档 | 架构设计、实施计划、开发计划、课程规格、进展记录 | `docs/`(`docs/superpowers/`、`docs/2026-08-20-mindharbor-course-spec.md` 等) |
| 知识库数据 | 心理科普/咨询流程/值班信息等 Markdown 文档 | `backend/data/knowledge/` |
| 种子账号 | student/counselor/admin(密码见 `scripts/seed.py` 说明) | — |

### 2.4 约束和假设

| 类别 | 内容 |
|---|---|
| 技术约束 | 后端 Python ≥3.12;前端 Node ≥18、TypeScript 严格模式;JWT 认证 + 角色中间件;情绪类别枚举固定 `[anxious, sad, angry, lonely, tired, calm, hopeful]`;情绪记录仅在 LLM 生成日记时一并产出;**所有 AI 能力只能经 `app/adapters/` 访问模型**;SQL Agent 只读连接 + SELECT 白名单 + AST 校验;密钥只进环境变量、禁止提交仓库 |
| 角色与权限约束 | 学生端日记只读查看自己的;情绪趋势仅咨询师端;管理端仅 CRUD;后台接口按角色 `require_roles` 授权,遵循最小权限原则 |
| 部署约束 | PostgreSQL 与 Milvus v3.0.0 部署于本机/局域网;演示环境需云端 LLM/Embedding/TTS 服务可用(免费额度) |
| 假设 | 团队成员可通过虚拟局域网访问开发机(`172.16.2.91:8000`);网络满足校园网/本机演示;学生可访问浏览器,语音场景具备麦克风/扬声器 |
| 教学约束 | 测试不得真实调用 LLM API(monkeypatch 替换 `adapters/`);agent 循环逐步日志化,便于课堂调试 |

---

## 3. 利益相关人

### 3.1 利益相关人角色和职责

| 角色 | 组织/人员 | 主要职责 | 关注点 |
|---|---|---|---|
| 项目负责/后端 | 开发团队(本仓库维护者) | 后端 API、服务层、AI 编排(RAG/Agent/对话/记忆)、数据访问、咨询师端 Agent;维护工程文档与进展记录 | 功能闭环、安全边界、测试覆盖 |
| 前端团队 | 团队成员(2026-08-15 接收前端) | 学生端 / 管理端 / 咨询师端全部页面与交互;基于 `docs/api.md` 契约联调 | 接口契约、SSE 渲染、三角色路由 |
| 课程教师/验收方 | 课程指导教师 | 里程碑验收、演示评审、文档评审 | 需求符合度、演示闭环、工程规范性 |
| 最终用户 | 在校大学生(演示/测试) | 使用学生端倾诉与练习;体验情绪陪伴与资源查询 | 响应速度、语气边界、风险兜底 |
| 咨询师(角色) | 演示中由教师/团队扮演 | 通过咨询师端查看学生情绪日记与趋势、进行会话质检 | 数据可视、信息可溯源 |

### 3.2 有关的利益相关人介入计划

| 时间点/阶段 | 介入方式 | 参与角色 |
|---|---|---|
| 里程碑验收(M1–M4 后端逐项) | 后端自测 + 文档记录;关键里程碑请求评审 | 后端 + 教师 |
| 前端移交(M5–M7,2026-08-15) | 前端功能交接至前端团队,后端以 `docs/api.md` 提供契约;合并经 PR 评审 | 前端团队 + 后端 |
| 每次接口/跨模块变更 | 先更新契约文档,再请求 code review 后合并 | 后端 + 前端 |
| M8 集成联调 | 全链路演示脚本演练 + 联合排查 | 全体 + 教师 |
| 期末验收 | 演示 + 论文/文档(规格、开发计划、API)提交 | 教师 |

---

## 4. 项目的已定义过程

### 4.1 项目的生命周期选择

采用**迭代增量式生命周期**(课程规模下的轻量实践):

- 以架构设计文档为基线,按 M1–M8 增量推进;每个里程碑内遵循 **TDD**:先写失败测试 → 最小实现 → 测试通过 → 提交(前端里程碑为页面实现 + `pnpm build` 验证)。
- 每轮增量产出可演示的垂直切片(如 M3 完成后即具备「聊天 → 日记 → 趋势」闭环)。
- 里程碑节奏受控(每天可提交多个里程碑粒度 commit),需求变更通过文档同步(progress.md / 规格文档)管理。

### 4.2 项目阶段划分及主要工作产品

| 阶段 | 里程碑 | 主要工作内容 | 主要工作产品 | 状态 |
|---|---|---|---|---|
| 需求与架构 | — | 概要设想澄清、技术选型、架构/需求文档 | `docs/superpowers/specs/2026-08-14-mindharbor-design.md`、实施计划、开发计划 | ✅ 已完成 |
| M1 脚手架与认证 | M1 | 项目脚手架、配置/安全/数据库、数据模型与建表、种子数据、JWT 认证与角色权限 | 后端分层骨架、`models/*`、`core/*`、auth API、`init_db/seed` 脚本 | ✅ 已完成 |
| M2 RAG 知识库 | M2 | 知识库入库管道、父子分块、RRF 混合检索、引用来源 | `ai/rag/`(ingest/search)、`adapters/embedding.py`、`ingest_knowledge.py` | ✅ 已完成 |
| M3 对话主流程 | M3 | 情绪识别、风险筛查、三层记忆管理、SSE 聊天、情绪日记闭环 | `ai/{dialogue,emotion,journal,memory}.py`、`POST /chat` | ✅ 已完成 |
| M4 Agent 编排 | M4 | 工具注册表 + function-calling 循环、7 工具(SQL Agent 只读、TTS) | `ai/agent.py`、`ai/tools/`、咨询师端 `counselor*.py` | ✅ 已完成 |
| M5–M7 三角色前端 | M5–M7 | 学生端(聊天/练习/收藏/历史)、管理端 CRUD、咨询师端(学生心理/SQL 助手);前端移交与合并 | `frontend/src/pages/{student,admin,counselor}/*` 等 29 文件 | ✅ 已合并(2026-08-15) |
| M8 集成联调与部署 | M8 | 全链路联调(登录→聊天→工具→日记→趋势→质检)、演示脚本、docker-compose、README | 演示脚本 `docs/demo.md`、部署编排、联调记录 | ⏳ 未开始 |
| 收尾 | — | 文档归档、评审、演示准备 | 规格/开发计划/API 文档终稿、验收记录 | ⏳ 未开始 |

---

## 5. 项目监控计划

### 5.1 活动安排

**工作分解结构与进度**(以 2026-08-14 立项、文档日期 2026-08-21 为基线的实际进度):

| WBS | 活动 | 计划周期 | 实际/当前状态 | 输出/完成标志 |
|---|---|---|---|---|
| 1.0 | 需求分析 + 架构设计 | 第 1 周 | ✅ 2026-08-14 设计文档定稿 | 设计文档、实施计划 |
| 1.1 | 脚手架、数据模型、认证(M1) | 第 1 周 | ✅ | `GET /health`、`/auth/login` 可用;模型测试通过 |
| 2.0 | RAG 知识库(M2) | 第 1–2 周 | ✅ | 知识检索带来源;`test_rag.py` 通过 |
| 3.0 | 对话 + 情绪日记闭环(M3) | 第 2 周 | ✅ | SSE 聊天、日记/情绪落库闭环 |
| 4.0 | Agent + 7 工具(M4) | 第 2–3 周 | ✅ | 工具卡片齐全;SQL Agent 安全校验 |
| 5.0 | 三角色前端(M5–M7) | 第 3–4 周 | ✅ 2026-08-15 前端移交并合并 `feature/frontend-tri-role` | `pnpm build` 通过;`docs/api.md` 契约同步 |
| 5.1 | 咨询师端迭代 | 第 4 周后 | ✅ 档案/趋势/会话回放/日记↔会话关联(progress 记录) | `test_counselor_stats.py` 通过 |
| 6.0 | M8 集成联调 + 演示脚本 | 第 5 周起 | ⏳ 未开始(计划下一步) | 演示脚本、联调记录 |
| 6.1 | 补齐课程文档(规格/开发计划) | 第 5 周 | 🔵 进行中 | 本文档与规格文档 |
| 7.0 | 收尾评审与演示准备 | 期末 | ⏳ | 教师验收记录 |

**监控机制**：

- **进展记录(强制约定)**:每个任务/commit 完成后,向 `docs/progress.md` 追加条目(日期/内容/涉及文件/测试结果/commit/评审结论/遗留问题),作为团队与多 AI 会话的唯一状态来源(AGENTS.md 约定)。
- **测试门槛**:后端每次变更须 `pytest tests/ -q` 全绿(当前 125 用例);前端变更须 `pnpm build` 通过;声称完成前必须运行验证命令并贴出输出。
- **分支与评审**:`main` 为稳定分支保持可运行;功能分支 `feature/<milestone>-<name>` 通过 PR 评审合并到 `main`;提交遵循 Conventional Commits(一个计划任务一个 commit)。
- **风险与问题跟踪**:风险清单见设计文档 §10(云端 API 限额、RAG 检索质量、SQL Agent 生成错误 SQL 等);实际遇到的环境问题(如全量测试连接池耗尽、`api_config.resolve_service` 读开发库配置)已随 progress.md 记录并修复。

**当前已知待办**(截至 2026-08-21):

| 待办 | 说明 |
|---|---|
| M8 全链路联调与演示脚本 | 编制 `docs/demo.md`,验证演示闭环与故障降级 |
| `PATCH /auth/me` 扩展资料字段(email/phone) | 已保留为后续功能 |
| api.md 双前缀(``/api/v1/api/v1/``) | 生成脚本既有格式 bug,待修 |
| 演示库/局域网库注意事项 | 建表脚本 `create_all` 对既有表不加列;联调前按文档核对 |

---

## 6. 测试工具和软件环境

### 6.1 硬件与操作系统环境

| 项 | 约定 |
|---|---|
| 开发机 | Windows 11 + WSL2(Ubuntu);局域网地址 `172.16.2.91` |
| 演示环境 | 标准浏览器;语音场景需麦克风/扬声器/耳机 |

### 6.2 软件环境

| 层次 | 工具/版本 |
|---|---|
| 操作系统 | Windows 11 + WSL2(Linux 6.x) |
| 后端语言 | Python 3.12.3(虚拟环境 `.venv`) |
| 后端框架 | FastAPI、SQLAlchemy 2、Pydantic 2 / pydantic-settings、PyJWT、bcrypt |
| 向量检索 | Milvus v3.0.0(本机 Docker,:19530)+ pymilvus |
| 数据库 | PostgreSQL(localhost:5432;业务库 `mindharbor`、测试库 `mindharbor_test`) |
| AI 服务 | 云端 LLM / Embedding / TTS API(经 `app/adapters/`,密钥走环境变量) |
| 前端 | Node ≥18、Vite、React 18、TypeScript 严格模式、React Query、Zustand、ECharts |
| 前端构建 | `pnpm build`(`tsc -b && vite build`);dev 代理 `/api` → :8000 |
| 测试工具 | pytest(9.x)+ `fastapi.testclient` + `monkeypatch`(禁止真实调用 LLM) |
| 脚本工具 | `scripts/init_db.py`、`scripts/seed.py`、`scripts/ingest_knowledge.py`、`scripts/gen_api_docs.py` |
| 版本控制 | Git(GitHub 规范:分支 + PR 评审、Conventional Commits) |
| 接口联调 | `curl` / OpenAPI(`:8000/openapi.json` → `docs/api.md` 自动生成) |

### 6.3 测试策略要点

- **单元/接口测试**:`backend/tests/` 按模块组织(auth/agent/rag/dialogue/emotion/memory/counselor/admin/student 等),当前 **125 用例全绿**;测试库独立(`mindharbor_test`),每次函数级 fixture 重建表并 `dispose()` 连接池;
- **隔离要求**:AI 能力一律 monkeypatch `adapters/`;局域网镜像同步在测试中禁用;
- **前端验证**:`pnpm build` + dev server 冒烟(登录/首页/聊天页);
- **联调验证**:M8 阶段按演示脚本走全链路,记录真实 LLM + 工具调用 + 日记落库结果。