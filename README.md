# MindHarbor · AI 心理咨询与情感陪伴助手

面向**大学生**的课程项目:文字倾诉、情绪识别、知识库问答(RAG)、陪伴 Agent、情绪日记闭环,以及学生端 / 管理端 / 咨询师端三角色前端。

## 技术栈

- 后端:Python 3.12 · FastAPI · SQLAlchemy 2 · PostgreSQL(业务)+ Milvus v3.0.0(向量检索)
- AI:云端 LLM API(function calling)+ 自研适配层 / RAG / Agent / 上下文记忆管理
- 前端:React 18 · Vite · TypeScript · Zustand · React Query · ECharts

## 快速开始

### 1. 数据库(PostgreSQL 业务数据 + Milvus 向量库)

```bash
docker compose up -d postgres
# 或使用本地已有 PostgreSQL;Milvus v3.0.0 已部署于本机 Docker(端口 19530),无需启动
```

### 2. 后端

```bash
cd backend
cp .env.example .env          # 填入 LLM/Embedding/TTS 密钥
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
# http://localhost:8000/api/v1/health
```

### 3. 前端

```bash
cd frontend
pnpm install
pnpm dev
# http://localhost:5173
```

## 目录结构

```
backend/    FastAPI 模块化单体(core / api / services / ai / models / schemas / adapters)
frontend/   React 三角色前端(pages/{student,admin,counselor} / api / stores / router)
docs/       设计文档与实施计划
```

## 文档

- 架构设计:`docs/superpowers/specs/2026-08-14-mindharbor-design.md`
- 实施计划:`docs/superpowers/plans/2026-08-14-mindharbor-implementation.md`

## 安全边界

- 本项目为教学演示用途;危机干预请优先联系专业热线与校内咨询渠道。
- 密钥仅存环境变量,`.env` 不入库;SQL Agent 只读 + 白名单。
