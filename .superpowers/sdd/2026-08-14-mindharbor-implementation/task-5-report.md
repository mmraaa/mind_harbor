# Task 5 报告:对话主流程 + 情绪日记闭环(M3)

状态:**DONE**(40/40 测试通过;基线 35 + 修复轮新增 5 个 error 路径用例)

## 修复轮(评审反馈,commit 见 task-5-fix-report.md)

评审发现 3 条(1 Important + 2 Minor)已全部修复:

1. **Important — error 事件零测试覆盖**:新增 5 个 error 路径用例(见下方「修复轮新增测试」)。
2. **Minor — 空白内容孤儿会话**:`ChatRequest.content` 移除 `min_length=1`,路由层先 `strip()` 校验,空白内容直接产出 `error` 事件且**不调用 `get_or_create_session`**(不再落空会话行);`chat_stream` 内保留同文案兜底。
3. **Minor — error payload 泄露异常原文**:`_finish_session` 与 `chat.py` 兜底不再输出 `str(exc)`,统一改为通用文案「生成过程出现异常,请稍后重试」;异常详情经 `logger.exception` 进日志(新增 `logging` 到 `app/ai/dialogue.py` 与 `app/api/chat.py`)。

### 修复轮新增测试(test_dialogue.py)

- `test_chat_blank_content_yields_error_without_creating_session[blank]` — 空串/纯空白/制表符三种输入 → `type=="error"` 事件,且 `ChatSession`/`Message` 零落库(无孤儿会话)。
- `test_journal_generation_failure_yields_error_event` — 日记生成抛异常 → `error` 事件 + 通用文案、不泄异常原文、`Journal` 不落库、会话不置 closed、异常详情在日志中。
- `test_chat_mid_stream_exception_yields_error_event` — 流式回复产出增量后中途抛异常 → 已推送的 `text` 事件保留,`gen()` 兜底产出 `error` 事件,不中断流。

均 monkeypatch `app.adapters.llm` 与 `app.ai.rag.search.search`,零真实 API。

### 测试输出

`cd backend && .venv/bin/pytest -q` → **40 passed in 71.30s**



## 文件清单

| 文件 | 说明 |
|---|---|
| `backend/app/adapters/llm.py` | 新建。LLM 适配层(OpenAI 兼容 chat completions,httpx 实现):流式 / JSON / 文本三种接口,配置校验,JSON 解析兜底 |
| `backend/app/ai/emotion.py` | 新建。情绪识别 + 风险筛查(危机关键词库 + LLM 判定),风险回复模板(附录 B) |
| `backend/app/ai/memory.py` | 新建。记忆管理:短期窗口 / 会话摘要压缩 / 长期画像(用户画像 + Emotion 聚合),`assemble_context` / `update` |
| `backend/app/ai/journal.py` | 新建。日记闭环:`generate()` LLM 一次调用产出日记 + 结构化情绪,原子写 `Journal` + `Emotion`(journal_id 关联) |
| `backend/app/ai/dialogue.py` | 新建。对话控制器:识别 → 风险 → 记忆 → 提示词 → LLM 流式 → 写 Message → 日记闭环,yield SSE 事件 dict |
| `backend/app/api/chat.py` | 新建。`POST /api/v1/chat`,`StreamingResponse` 输出 SSE |
| `backend/app/schemas/chat.py` | 新建。`ChatRequest(session_id, content, end_session)` |
| `backend/tests/test_dialogue.py` | 新建。12 个测试:识别、风险(关键词 + LLM)、日记落库与 `Journal↔Emotion` 关联、SSE 格式、权限、记忆 |
| `backend/app/main.py` | 修改。注册 chat router(`/api/v1/chat`) |

## 公开接口签名

- `app/adapters/llm.py`
  - `stream_chat(messages: list[dict], *, temperature=0.7, max_tokens=None) -> Iterator[str]` — 流式对话,逐增量 yield 文本(OpenAI SSE 协议,`data:` 行解析,`[DONE]` 结束)。
  - `complete_json(system: str, user: str, *, temperature=0.2) -> dict` — 结构化 JSON 输出;`response_format={"type":"json_object"}` + schema 提示词;解析失败兜底重试一次(追加"只输出 JSON"指令),仍失败抛 `RuntimeError`。
  - `complete_text(system: str, user: str, *, temperature=0.3, max_tokens=None) -> str` — 一次性整段文本(记忆摘要)。
  - key/base_url/model 缺失时抛清晰 `RuntimeError`(`请设置环境变量 LLM_API_KEY/LLM_BASE_URL/LLM_MODEL`)。
- `app/ai/emotion.py`
  - `analyze(text: str) -> EmotionResult`;`EmotionResult(category, intensity, stress_source, support_need, is_risk, risk_reason)`;`RISK_KEYWORDS`(自伤/自杀类,含"不想活""轻生"等 13 词)、`RISK_REPLY_TEMPLATE`(附录 B:危机热线 400-161-9995 + 校内心理咨询中心)。
  - 关键词命中直接返回 `is_risk=True`(不调 LLM);否则 `llm.complete_json` 判定;非法类别回落 `calm`,intensity 收敛 1-10。
- `app/ai/memory.py`
  - `assemble_context(session, messages, user_id, db, rag_hits=None) -> str` — 按「长期画像 → 会话摘要 → 近期对话(≤10 轮)→ 知识参考」拼接。
  - `update(session, messages, user_id, db) -> None` — 消息 ≥20 条且无摘要 → LLM 压缩写 `ChatSession.summary`;规则抽取事实(名字/年级专业)去重沉淀 `UserMemory`。
- `app/ai/journal.py`
  - `generate(session_id: int, db: Session, user_id: int) -> Journal` — 一次 `llm.complete_json` 产出 `{journal_summary, journal_content, mood_score, emotion:{...}}`;同一事务原子写 `Journal` + `Emotion(journal_id=...)`,失败 rollback;摘要回写 `session.summary`。**Emotion 表写入只发生在此模块(铁律)**。
- `app/ai/dialogue.py`
  - `get_or_create_session(db, user, session_id: int | None) -> ChatSession` — 会话不存在 404、非本人 403。
  - `chat_stream(db, user, session, body: ChatRequest) -> Iterator[dict]` — yield 事件 dict。
- `app/api/chat.py`
  - `POST /api/v1/chat`(Body `ChatRequest`;Auth Bearer)→ `StreamingResponse(media_type="text/event-stream")`,`Cache-Control: no-cache`。

## SSE 事件格式实现

每事件一行 `data: {"type": "<type>", "payload": {...}}` 后跟一个空行(`\n\n`),`json.dumps(ensure_ascii=False)`:

- `text`:`{"content": <增量>}` — 流式逐增量推送;风险路径推送整段风险模板。
- `tool_card`:`{"type": "crisis", "hotline": "400-161-9995", "note": ...}`(风险命中)或 `{"type": "sources", "sources": [{"title", "text"}]}`(RAG 知识引用)。
- `journal`:`{"journal_id", "summary", "content", "mood_score", "emotion": {"category", "intensity", "stress_source", "support_need"}}` — `end_session=True` 时在文本/工具卡片事件之后推送。
- `error`:`{"message": ...}` — 内部异常与日记生成失败兜底,不中断流。

## 对话主流程(chat_stream)

1. 空白内容 → `error` 事件;新会话首条消息自动命名标题。
2. 用户消息落库 → `emotion.analyze`(关键词快速通道,不调 LLM)→ 风险:置 `session.risk_level="high"`,写风险模板助手消息,推 `text` + `crisis` 卡片。
3. 正常路径:`rag_search.search(content, top_k=3)` → `memory.assemble_context` → `llm.stream_chat`(system 含长期画像/摘要/近期对话/知识参考)→ 增量 `text` 事件 → RAG 命中推 `sources` 卡片 → 助手消息落库(`emotion_tags=[category]`, `tool_cards`)→ `memory.update` → commit。
4. `end_session=True`:调用 `journal.generate` → 推 `journal` 卡片 → `session.status="closed"`。

## 测试证据

`cd backend && .venv/bin/pytest -q` → **35 passed** in 70s(基线 23 个未破坏 + 新增 12 个)。新增用例覆盖:

- `test_chat_creates_session_streams_reply_and_persists` — 识别 + 流式 + 落库 + emotion_tags + sources 卡片;
- `test_chat_reuses_existing_session` — 复用会话;
- `test_risk_keyword_triggers_template_and_marks_session` — 关键词风险(不调 LLM)→ 模板 + risk_level=high;
- `test_risk_via_llm_judgement` — LLM 判定风险同样走模板;
- `test_end_session_generates_journal_with_linked_emotion` — 日记落库、`Emotion.journal_id == Journal.id`、摘要回写、status=closed;
- `test_risk_end_session_still_writes_journal` — 风险 + 收尾仍产日记;
- `test_sse_event_format` — `data: {...}` + 空行格式、事件 key 为 `{type, payload}`;
- `test_chat_requires_auth` / `test_chat_rejects_foreign_session`(403)/ `test_chat_unknown_session_404`;
- `test_assemble_context_sections`、`test_memory_update_extracts_facts_and_compresses_summary` — 记忆单测。

测试全部 monkeypatch `app.adapters.llm`(complete_json/stream_chat/complete_text)与 `app.ai.rag.search.search`,零真实 API 调用。另用独立脚本验证 `_extract_json` 兜底(代码围栏 / 内联解释 / 字符串内大括号)与配置缺失报错。

## 遗留问题 / 说明

1. `llm.stream_chat` 基于 httpx 流式解析 OpenAI SSE(`data:` 行);对非兼容流(如某些供应商只返回整段)上游若在 stream 模式一次返回整段 JSON,也能解析出 content,不会崩溃。
2. 对话期间未做"LLM 判断摘要"之外的会话内摘要触发(`memory.update` 每轮调用,仅在 ≥20 条且无摘要时调 LLM 一次,成本可控)。
3. 日记 `journal` 事件 payload 未把整个 Emotion 对象回传(只回传 emotion 摘要字段),前端卡片足够;完整记录在 `emotions` 表。
4. `RISK_KEYWORDS` 与风险模板文案位于 `app/ai/emotion.py`,如需管理端可配置,后续任务可迁库。
5. 未实现 TTS/多模态/前台 SSE 心跳(不需要,M3 范围)。
