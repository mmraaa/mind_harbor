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

