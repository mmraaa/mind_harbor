# AGENTS.md

本文件为仓库内 AI 编码助手(Claude Code / Cursor / Copilot / Gemini 等)提供协作指导,是项目约定的**唯一事实来源**;`CLAUDE.md` 是其软链接(改本文件即同步)。

## 项目概览

MindHarbor — 面向大学生的 AI 心理咨询与情感陪伴助手课程项目。核心链路:**文字聊天 → 情绪识别/风险筛查 → 上下文记忆管理 → 生成回复 → LLM 生成情绪日记(情绪记录一并落库)→ 情绪趋势(咨询师端查看)**。

关键设计文档(先读它们,再改代码):
- 架构设计:`docs/superpowers/specs/2026-08-14-mindharbor-design.md`
- 实施计划:`docs/superpowers/plans/2026-08-14-mindharbor-implementation.md`(M1–M8 任务清单)

## 架构要点

**三角色前端 + 单一后端**:

- `frontend/` — React+Vite+TS 单工程,按角色路由拆 `pages/{student,admin,counselor}`;学生端只有 聊天/练习/收藏/历史,无日记与趋势查看。
- `backend/` — FastAPI 模块化单体,分层:
  - `core/` 配置/安全/数据库/日志(脚手架已就绪)
  - `api/` 路由(`chat`、`auth`、`admin/`、`counselor/` 等)
  - `services/` 业务服务层
  - `ai/` 对话 `dialogue.py`、情绪 `emotion.py`、日记 `journal.py`、记忆 `memory.py`、Agent `agent.py` + `tools/`(6 工具)+ `rag/`(ingest/search);**语音助手为独立桥接模块**(`api/voice.py` `POST /voice/bridge/chat` 浏览器 ASR→文本→流式 text+音频 URL,见 `docs/voice-bridge-protocol.md`);**咨询师端 Agent**:`counselor.py`/`counselor_tools.py`(独立工具集:学生情绪统计 SQL、学生日记检索、异常学生识别)
  - `models/` SQLAlchemy、`schemas/` Pydantic、`adapters/` 模型适配层
- 数据:PostgreSQL(业务数据)+ Milvus v3.0.0(向量检索,本机 Docker 端口 19530);chunk 元数据存 PG、向量存 Milvus collection(`knowledge_chunks`,按 chunk id 关联);`journals`↔`emotions` 由 `journal_id` 关联,情绪记录只在 LLM 生成日记时产出。

**铁律(改动前必读)**:
- 所有 AI 能力只经 `app/adapters/` 访问模型,禁止直连具体供应商。
- 情绪类别枚举固定:`[anxious, sad, angry, lonely, tired, calm, hopeful]`。
- SQL Agent 只读连接 + SELECT 白名单 + AST 校验。学生端 `query_emotion_stats`(仅本人,注入 user_id);咨询师端 `query_student_stats`(可查任意学生/全体,白名单含 `users` 表,权限由 API `require_roles("counselor","admin")` 保证)。
- 学生端:日记**只读**查看自己的(2026-08-15 更新,`GET /journals/mine`);不可修改;咨询师端可查看所有学生,管理端仅 CRUD。情绪趋势仅咨询师端。

## 常用命令

```bash
# 后端(working dir: backend/)
cp .env.example .env          # 首次:填入 LLM/Embedding/TTS 密钥
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 # 开发机(虚拟局域网):http://172.16.2.91:8000/api/v1/health

# 数据库
docker compose up -d postgres # 或本地 PostgreSQL;Milvus v3.0.0 已部署于本机 Docker(端口 19530)
python scripts/init_db.py     # 建表
python scripts/seed.py        # 种子数据(admin/counselor/student + 资源)

# 测试
pytest backend/tests -v       # 或 cd backend && pytest tests -v

# 前端(working dir: frontend/)
pnpm install
pnpm dev                      # http://localhost:5173(vite 代理 /api → :8000)
pnpm build                    # tsc -b && vite build
```

## 团队开发协作约定

### 团队网络与访问

- 开发机(虚拟局域网)地址:**172.16.2.91**;后端基址 `http://172.16.2.91:8000/api/v1`。
- CORS 已放开(`["*"]`);后端以 `--host 0.0.0.0` 启动,团队成员可直接请求该地址。
- 前端开发:成员本地跑 vite;连接开发机后端时,在 `frontend/.env.development` 设 `VITE_PROXY_TARGET=http://172.16.2.91:8000`(默认 localhost:8000)。
- 若团队无法访问,检查 Windows 防火墙是否放行 8000/5432/19530 端口。

### 角色与职责

| 角色 | 范围 |
|---|---|
| 前端团队 | 学生端 / 管理端 / 咨询师端全部页面(2026-08-15 移交;接口契约见 `docs/api.md`) |
| 后端 | API、服务层、AI 编排(RAG/Agent/对话/记忆)、数据访问;咨询师端对话 Agent(学生情绪统计/日记/异常识别) |

> 注意:`frontend/src` 已从仓库移除(交给前端团队),只保留脚手架配置。后端开发不依赖前端。

### Git 工作流

- `main` 为稳定分支,保持可运行。
- 功能分支:`feature/<milestone>-<name>`(如 `feature/m2-rag`);修复分支:`fix/<name>`。
- 禁止直接推送 `main`;通过 PR 评审合并。
- 提交粒度:一个 plan Task 一个 commit,不混入无关改动。

### 提交规范(Conventional Commits)

- 前缀:`feat:` 新功能 / `fix:` 修复 / `chore:` 构建与杂项 / `refactor:` 重构 / `docs:` 文档 / `test:` 测试。
- 示例:`feat: add JWT auth with role-based access`。
- 遵循 `docs/superpowers/plans/` 中各任务的提交命令。

### 开发流程

1. 改代码前先读本文件与 `docs/superpowers/` 下的 spec / plan。
2. 大功能流程:brainstorming → 写 spec → writing-plans → 按计划实现。
3. 后端 M2 起遵循 TDD:先写失败测试 → 最小实现 → 测试通过 → 提交。

### AI 辅助开发约定

- 开始前:先读本文件;探索相关代码与文档,遵循既有模式,不做无关重构。
- 测试**不得**真实调用 LLM API;用 monkeypatch 替换 `app/adapters/` 的模型调用。
- 密钥只进环境变量;不得提交 `.env`、密钥或绕过权限校验。
- 声称完成前必须运行验证命令(pytest / pnpm build)并贴出输出;有证据再下结论。
- 交付前自查:无占位符、命名与类型一致、与既有接口兼容。
- 跨模块 / 接口变更,先请求 code review 再合并。

### 代码风格

- 后端:Python 3.12,带类型注解;服务职责单一;FastAPI 依赖注入。
- 前端:TypeScript 严格模式;页面归 `pages/<role>/`,通用组件归 `components/`。
- 枚举(情绪类别、角色)集中定义,禁止散落魔数。

### 评审与合并

- 合并前请求评审;评审意见用技术验证后采纳,不盲从也不敷衍。
- 评审通过、测试/构建全绿才合并到 `main`。

### 文档维护

- spec / plan 在 `docs/superpowers/` 下,随设计演进同步更新。
- 新增密钥示例同步到 `backend/.env.example`。
- 新增约定写回本文件,保持唯一事实来源。
- **进展记录(每次任务完成后必做)**:完成一个任务(或一个 commit)后,把进展追加到 `docs/progress.md`——格式见该文件头部说明;内容包括:完成内容、涉及文件/接口、测试结果、commit hash、评审结论、遗留问题。团队任何人/任何 AI 会话可通过该文件了解项目当前状态。
