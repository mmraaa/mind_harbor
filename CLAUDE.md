# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
  - `ai/` 对话 `dialogue.py`、情绪 `emotion.py`、日记 `journal.py`、记忆 `memory.py`、Agent `agent.py` + `tools/`(7 工具)+ `rag/`(ingest/search)
  - `models/` SQLAlchemy、`schemas/` Pydantic、`adapters/` 模型适配层
- 数据:PostgreSQL + pgvector(`KnowledgeChunk.embedding` 向量检索);`journals`↔`emotions` 由 `journal_id` 关联,情绪记录只在 LLM 生成日记时产出。

**铁律(改动前必读)**:
- 所有 AI 能力只经 `app/adapters/` 访问模型,禁止直连具体供应商。
- 情绪类别枚举固定:`[anxious, sad, angry, lonely, tired, calm, hopeful]`。
- SQL Agent(`query_emotion_stats`)只读连接 + SELECT 白名单 + AST 校验。
- 学生端不可查看/修改日记与情绪;查看归咨询师端,管理端仅 CRUD。

## 常用命令

```bash
# 后端(working dir: backend/)
cp .env.example .env          # 首次:填入 LLM/Embedding/TTS 密钥
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload # http://localhost:8000/api/v1/health

# 数据库
docker compose up -d postgres # 或本地 pgvector 实例
python scripts/init_db.py     # 建表
python scripts/seed.py        # 种子数据(admin/counselor/student + 资源)

# 测试
pytest backend/tests -v       # 或 cd backend && pytest tests -v

# 前端(working dir: frontend/)
pnpm install
pnpm dev                      # http://localhost:5173(vite 代理 /api → :8000)
pnpm build                    # tsc -b && vite build
```

## 约定

- 后端按计划以 TDD 推进(M2 起每任务先写测试);测试用 monkeypatch 替换 `adapters/` 的 LLM 调用,不真实打 API。
- 提交粒度:每个任务一个 commit,遵循 plan 中各任务的提交命令。
- 密钥只进环境变量;`.env` 已 gitignore,新增密钥示例同步到 `backend/.env.example`。
