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

