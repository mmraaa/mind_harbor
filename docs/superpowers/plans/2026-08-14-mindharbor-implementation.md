# MindHarbor 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现面向大学生的 AI 心理咨询与情感陪伴助手——对话/RAG/Agent/情绪日记闭环 + 学生端/管理端/咨询师端三角色前端。

**Architecture:** 三角色前端(React+Vite,按角色路由)+ 单一后端(FastAPI 模块化单体)+ PostgreSQL(pgvector)。AI 编排层含情绪识别、风险筛查、上下文记忆管理(`memory.py`)、情绪日记生成(`journal.py`)、RAG、Agent 工具集。

**Tech Stack:** Python 3.12 / FastAPI / SQLAlchemy 2 / PostgreSQL+pgvector / React 18+Vite+TS / Zustand+React Query / SSE 流式 / 云端 LLM API(function calling)

**Spec:** `docs/superpowers/specs/2026-08-14-mindharbor-design.md`

## Global Constraints

- 后端 Python ≥3.12;前端 Node ≥18、TypeScript 严格模式。
- 角色:`student` / `counselor` / `admin`;JWT 认证 + 角色权限中间件。
- 情绪类别枚举固定:`[anxious, sad, angry, lonely, tired, calm, hopeful]`。
- 情绪记录仅在 LLM 生成日记时一并产出(`source` 无手动);`journals`↔`emotions` 由 `journal_id` 关联。
- 学生端无日记/趋势查看;查看归咨询师端;管理端仅 CRUD。
- SQL Agent 只读连接 + 语句白名单;密钥只进环境变量,不提交仓库。
- 所有 AI 模块经 `app/adapters/` 访问模型,禁止直接调用具体供应商。

---

## 文件结构总览

```
backend/app/
  main.py               # FastAPI 入口,挂载 router
  core/                 # config.py / security.py / database.py / logging.py
  api/                  # chat / emotions / journals / resources / breathing /
                        #   reminders / favorites / auth / admin/ / counselor/
  services/             # 业务服务层
  ai/                   # dialogue / emotion / journal / memory / agent
    tools/              # registry + 7 个工具
    rag/                # ingest / chunking / search
  models/               # SQLAlchemy 模型
  schemas/              # Pydantic
  adapters/             # llm / embedding / tts
backend/scripts/        # init_db / seed / ingest_knowledge
backend/tests/          # pytest
frontend/src/
  pages/{student,admin,counselor}/   # 三角色页面
  components/            # 聊天 / 卡片 / 图表
  api/                   # axios + SSE
  stores/                # Zustand
  router/                # 角色路由
```

---

### Task 1: 项目脚手架与基础配置(M1)

**Files:**
- Create: `.gitignore`、`.env.example`、`README.md`、`docker-compose.yml`
- Create: `backend/requirements.txt`
- Create: `backend/app/core/config.py`、`backend/app/core/database.py`、`backend/app/core/security.py`、`backend/app/core/logging.py`
- Create: `backend/app/main.py`、`backend/app/api/__init__.py`、`backend/app/api/health.py`
- Create: `frontend/package.json`、`frontend/vite.config.ts`、`frontend/tsconfig.json`、`frontend/index.html`、`frontend/src/main.tsx`、`frontend/src/App.tsx`

**Interfaces:**
- Produces: `Settings`(config), `get_db()`(session 依赖), `create_access_token`/`verify_token`, FastAPI `app` 挂载 `/api/v1/health`。

- [ ] **Step 1: git init + 目录**

```bash
git init
mkdir -p backend/app/{core,api,services,ai/{tools,rag},models,schemas,adapters} backend/scripts backend/tests
mkdir -p frontend/src/{pages/{student,admin,counselor},components,api,stores,router}
```

- [ ] **Step 2: `.gitignore`**

```gitignore
# 环境与密钥
.env
.env.local
*.pem

# Python
__pycache__/
*.py[cod]
.venv/
venv/
.pytest_cache/
.mypy_cache/
.ruff_cache/

# Node
node_modules/
dist/
frontend/dist/

# 数据库与日志
*.sqlite3
*.db
logs/
*.log

# IDE / OS
.idea/
.vscode/
.DS_Store

# 模型与缓存
*.parquet
.cache/
```

- [ ] **Step 3: `.env.example`(根 + backend)**

```bash
# 根 .env.example
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=mindharbor
POSTGRES_USER=mindharbor
POSTGRES_PASSWORD=mindharbor
JWT_SECRET=change-me-in-prod
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=1440

# 大模型(DeepSeek 示例,可换通义/智谱)
LLM_API_KEY=
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_MODEL=deepseek-chat
EMBEDDING_API_KEY=
EMBEDDING_BASE_URL=
EMBEDDING_MODEL=
TTS_API_KEY=
TTS_BASE_URL=
TTS_VOICE=

CORS_ORIGINS=http://localhost:5173
```

- [ ] **Step 4: 后端 config.py(pydantic-settings)**

```python
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "MindHarbor"
    api_prefix: str = "/api/v1"

    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "mindharbor"
    postgres_user: str = "mindharbor"
    postgres_password: str = "mindharbor"

    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440

    cors_origins: list[str] = ["http://localhost:5173"]

    llm_api_key: str = ""
    llm_base_url: str = ""
    llm_model: str = "deepseek-chat"
    embedding_api_key: str = ""
    embedding_base_url: str = ""
    embedding_model: str = ""
    tts_api_key: str = ""
    tts_base_url: str = ""
    tts_voice: str = ""

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+psycopg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

- [ ] **Step 5: database.py + security.py**

```python
# database.py
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from .config import get_settings

engine = create_engine(get_settings().database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

```python
# security.py
import datetime as dt
import jwt
from passlib.context import CryptContext
from .config import get_settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(p: str) -> str:
    return pwd_context.hash(p)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(user_id: int) -> str:
    s = get_settings()
    payload = {"sub": str(user_id), "exp": dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=s.jwt_expire_minutes)}
    return jwt.encode(payload, s.jwt_secret, algorithm=s.jwt_algorithm)


def verify_token(token: str) -> int:
    s = get_settings()
    payload = jwt.decode(token, s.jwt_secret, algorithms=[s.jwt_algorithm])
    return int(payload["sub"])
```

- [ ] **Step 6: main.py + health 路由 + 前端骨架**

```python
# main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import health
from app.core.config import get_settings

settings = get_settings()
app = FastAPI(title=settings.app_name)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.include_router(health.router, prefix=settings.api_prefix)
```

```python
# api/health.py
from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}
```

`frontend`: 初始化 Vite+React+TS(react-router-dom、zustand、@tanstack/react-query、axios、echarts)。

- [ ] **Step 7: 验证脚手架**

```bash
cd backend && python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
# GET http://localhost:8000/api/v1/health  → {"status":"ok"}
cd frontend && pnpm install && pnpm dev  # http://localhost:5173
```

- [ ] **Step 8: 提交**

```bash
git add -A && git commit -m "chore: scaffold project (backend/frontend, env, config)"
```

---

### Task 2: 数据模型与建表(M1)

**Files:**
- Create: `backend/app/models/*.py`(user、session、message、emotion、journal、resource、favorite、reminder、knowledge、memory)
- Create: `backend/scripts/init_db.py`、`backend/scripts/seed.py`
- Test: `backend/tests/test_models.py`

**Interfaces:**
- Produces: `Base` 下全部表;`User`、`Session`、`Message`、`Emotion`、`Journal`、`Resource`、`Reminder`、`KnowledgeChunk` 等 ORM 类;`init_db()`、`seed()`。

- [ ] **Step 1: 写模型与测试**

`User(id, role, username, name, password_hash)`;`Session(id, user_id, title, summary, risk_level)`;`Message(id, session_id, role, content, emotion_tags)`;`Journal(id, user_id, session_id, summary, content, mood_score)`;`Emotion(id, user_id, journal_id, session_id, category, intensity, stress_source, support_need)`;`Resource`;`Reminder`;`KnowledgeChunk(id, doc_id, content, embedding)`;`UserMemory(id, user_id, memory_type, content, importance)`。

- [ ] **Step 2: init_db + seed + 测试**

`scripts/init_db.py`:建表;`scripts/seed.py`:插入三角色账号(admin/counselor/student)、示例资源、示例咨询师。测试:`test_models.py` 校验 ORM 可写读与关系。

- [ ] **Step 3: 提交**

```bash
git commit -m "feat: add SQLAlchemy models, init_db and seed scripts"
```

---

### Task 3: 认证与角色权限(M1)

**Files:**
- Create: `backend/app/api/auth.py`、`backend/app/api/deps.py`、`backend/app/schemas/user.py`
- Test: `backend/tests/test_auth.py`

**Interfaces:**
- Consumes: `create_access_token`/`verify_password`(Task 1)、`User`(Task 2)
- Produces: `POST /api/v1/auth/login` → `{access_token}`;`get_current_user`、`require_roles(*roles)` 依赖。

- [ ] **Step 1: 登录接口 + JWT 校验**

`POST /auth/login`(username+password)→ 校验 → 返回 token;`deps.py` 解析 `Authorization: Bearer` 得 `User`。

- [ ] **Step 2: 角色守卫**

`require_roles("admin")` 等依赖,在 `router` 层强制角色;学生端接口默认仅本人数据。

- [ ] **Step 3: 测试**

`test_auth.py`:正确/错误密码、无 token、错误角色 403 用例。

- [ ] **Step 4: 提交**

```bash
git commit -m "feat: JWT auth with role-based access"
```

---

### Task 4: RAG 知识库(M2)

**Files:**
- Create: `backend/app/ai/rag/chunking.py`、`ingest.py`、`search.py`;`backend/app/adapters/embedding.py`
- Create: `backend/scripts/ingest_knowledge.py`
- Test: `backend/tests/test_rag.py`

**Interfaces:**
- Consumes: `KnowledgeChunk`(Task 2)、`get_db`(Task 1)
- Produces: `ingest_document(path) -> int`(chunk 数)、`search(query: str, top_k=5) -> list[ChunkHit]`、`ChunkHit(text, doc_title)`。

- [ ] **Step 1: 分块 + 入库管道**

`chunking.py`:按段落+固定窗口切块;`ingest.py`:读取文档 → 分块 → `embedding.embed(texts)` → upsert `KnowledgeChunk`(embedding 存 `Vector` 列)。

- [ ] **Step 2: 在线检索**

`search.py`:query → embedding → pgvector `<=>` 余弦 top-k → 可选关键词混合 → 返回带来源的命中。

- [ ] **Step 3: 测试 + 脚本**

`test_rag.py`:灌入样例语料,断言检索召回与引用来源;`ingest_knowledge.py` 读取 `data/knowledge/*.md` 批量入库。

- [ ] **Step 4: 提交**

```bash
git commit -m "feat: RAG ingest and pgvector search"
```

---

### Task 5: 对话主流程 + 情绪日记闭环(M3)

**Files:**
- Create: `backend/app/ai/dialogue.py`、`emotion.py`、`journal.py`、`memory.py`
- Create: `backend/app/api/chat.py`、`backend/app/schemas/chat.py`
- Test: `backend/tests/test_dialogue.py`

**Interfaces:**
- Consumes: `Emotion`/`Journal`/`Session`/`Message`(Task 2)、`search`(Task 4)、`get_current_user`(Task 3)
- Produces: `emotion.analyze(text) -> EmotionResult`;`memory.assemble_context(...)`/`update(...)`;`journal.generate(session_id)`;`POST /api/v1/chat`(SSE 流)。

- [ ] **Step 1: 情绪识别 + 风险筛查**

`emotion.py`:调用 `adapters/llm` 结构化输出 JSON;风险关键词库 + LLM 判定 → 触发风险模板并标记 `Session.risk_level`。

- [ ] **Step 2: 记忆管理**

`memory.py`:短期窗口(最近 N 轮 `Message`)、会话摘要(`Session.summary`)、长期画像(`UserMemory`+`Emotion` 聚合);`assemble_context` 拼接提示词。

- [ ] **Step 3: 对话控制器 + SSE**

`dialogue.py`:识别→风险→记忆→提示词→LLM 流式→写 `Message`;`chat.py` 用 `StreamingResponse` 输出 SSE 事件(`data: {text/tool_card}`)。

- [ ] **Step 4: 日记闭环**

`journal.py`:会话结束时 LLM 生成日记(摘要+结构化情绪)→ 写 `Journal` + 关联 `Emotion`(原子);前端聊天流收到日记卡片事件。

- [ ] **Step 5: 测试 + 提交**

`test_dialogue.py`:用假 `llm` 适配器(monkeypatch)断言识别、风险、日记落库、`Journal↔Emotion` 关联。提交 `feat: dialogue loop with emotion journal chain`。

---

### Task 6: Agent 编排 + 工具集(M4)

**Files:**
- Create: `backend/app/ai/agent.py`、`backend/app/ai/tools/registry.py`
- Create: `backend/app/ai/tools/{record_emotion,search_knowledge,generate_breathing,create_reminder,recommend_resources,query_emotion_stats,speak_voice}.py`
- Test: `backend/tests/test_agent.py`

**Interfaces:**
- Consumes: 各 service(记录/检索/提醒/资源)、`Emotion` 表、`adapters`
- Produces: `registry.register(tool)`;`agent.run(messages, session_id, user_id) -> list[events]`。

- [ ] **Step 1: 工具注册表 + function-calling 循环**

`registry.py`:`{name, description, input_schema, handler}` 注册表;`agent.py`:LLM function-calling → 执行 handler → 回填 → 继续/结束,事件流输出。

- [ ] **Step 2: 7 个工具**

按设计 §4.3 逐一实现;`query_emotion_stats` 走**只读连接 + SELECT 白名单 + AST 校验**;`speak_voice` 调 TTS 适配器流式。

- [ ] **Step 3: 测试 + 提交**

`test_agent.py`:注册表完整性、某工具执行回写、SQL Agent 拒绝非 SELECT。提交 `feat: agent orchestration with 7 tools`。

---

### Task 7: 学生端前端(M5)

**Files:**
- Create: `frontend/src/pages/student/*`(聊天/练习/收藏/历史)
- Create: `frontend/src/api/chat.ts`(SSE)、`frontend/src/components/{Chat, ToolCard, JournalCard}.tsx`
- Create: `frontend/src/stores/auth.ts`

**Interfaces:**
- Consumes: `POST /api/v1/chat`(SSE)、`/auth/login`
- Produces: 聊天页(流式气泡 + 工具卡片 + 会话结束日记卡片)、练习/收藏/历史页。

- [ ] **Step 1: 登录态 + 路由守卫**

`stores/auth.ts` 保存 token;`router` 未登录跳登录页。

- [ ] **Step 2: 聊天页 SSE 渲染**

`api/chat.ts` 用 fetch 流式读取,`Chat.tsx` 逐 token 渲染;`ToolCard`/`JournalCard` 按事件类型渲染。

- [ ] **Step 3: 其余学生端页面 + 提交**

练习/收藏/历史页接对应 API。提交 `feat: student frontend pages`。

---

### Task 8: 管理端 + 咨询师端(M6/M7)

**Files:**
- Create: `frontend/src/pages/admin/*`(咨询师/学生/资源 CRUD)
- Create: `frontend/src/pages/counselor/*`(会话质检/学生心理管理)
- Create: `backend/app/api/admin/`、`backend/app/api/counselor/` 对应只读与 CRUD 接口

**Interfaces:**
- Produces: 管理端 CRUD 页面与接口(admin 角色);咨询师端会话质检、学生日记/趋势(`echarts`)页面( counselor 角色)。

- [ ] **Step 1: 管理端 CRUD**

咨询师/学生/资源三套 CRUD 页面 + 后端 `admin/` 路由(仅 admin)。

- [ ] **Step 2: 咨询师端**

会话列表+消息回放+风险置顶质检;学生心理管理(日记列表 + ECharts 趋势 + 档案下钻),后端 `counselor/` 只读路由。

- [ ] **Step 3: 提交**

```bash
git commit -m "feat: admin CRUD and counselor student-psychology pages"
```

---

### Task 9: 集成联调与部署(M8)

**Files:**
- Modify: `docker-compose.yml`(postgres+backend+frontend)、`README.md`
- Create: 演示脚本 `docs/demo.md`

- [ ] **Step 1: 全链路联调**

登录→聊天(触发检索/呼吸/资源/日记)→ 情绪趋势(咨询师端)→ 质检;修复集成问题。

- [ ] **Step 2: docker-compose + 演示脚本 + 提交**

一键起 `pgvector/postgres + backend + frontend`;`docs/demo.md` 记录演示流程。提交 `feat: integration and deployment`。

---

## 自检结果

- **Spec 覆盖**:对话/情绪/日记闭环(Task 5)、RAG(Task 4)、Agent 7 工具(Task 6)、学生端(Task 7)、管理端+咨询师端(Task 8)、部署演示(Task 9)、认证/角色(Task 3)、DB(Task 2)。
- **无占位符**:各任务给出具体文件、接口与关键代码。
- **类型一致**:`EmotionResult`、`ChunkHit`、`registry` 注册表签名在 Task 4-6 间一致。
