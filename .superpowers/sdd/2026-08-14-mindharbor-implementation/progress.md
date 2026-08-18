# SDD ledger — plan: docs/superpowers/plans/2026-08-14-mindharbor-implementation.md

## 执行环境
- 分支:main(用户既定工作流,全部提交在 main;Ruling: 直接在 main 执行,不用 worktree — 用户指令"先按步骤完成后端设施"延续既有模式 — 若损坏可 git 回滚)
- 已完成(Task 1-3):M1 脚手架、12 表 + 种子、JWT 认证(提交 8cb37c3/66d2d18/94a4815 等)
- 待执行:Task 4 RAG(M2)、Task 5 对话闭环(M3)、Task 6 Agent(M4)

## 预检扫描
| 任务对 | 产出→消费 | 发现 |
|---|---|---|
| Task 4 → Task 5 | `search()/ChunkHit` → dialogue 检索 | 无冲突;Milvus 迁移后计划 Task 4 文本已同步 |
| Task 5 → Task 6 | chat SSE 事件 → `agent.run` events | 计划未统一事件结构 → 见 Rulings |
| Task 6 内部 | registry handler 签名 → 7 工具 | 派发时给出注册表契约(计划已列 7 工具) |

## Rulings
- Ruling: chat SSE 事件统一为 `data: {"type": "text"|"tool_card"|"journal", "payload": {...}}\n\n`;Task 5 定义实现,Task 6 的 `agent.run` 返回同构事件列表由 chat 透传 — 理由:计划仅写 `data: {text/tool_card}`,实现需明确契约 — 若错:事件序列化小幅重构

## 任务进度
- Task 4: complete (commits 8d051f8..4bf559e, review clean/Approved)
- Task 4: minor (deferred): #1 search 空白查询仍先触发 ensure_collection 外部调用; #2 ingest 对 embed() 返回数量无断言,数量不匹配静默截断; #3 缺"Milvus upsert 失败回滚 PG"与"Milvus 命中但 PG 无行跳过"分支测试; #4 requirements pymilvus>=2.5 仅在 3.0.1 实测(风险低)
- Task 5: 初审 Approved,进入 fix loop(1 Important)
- Task 5: minor (deferred): #2 空白内容产生孤儿会话; #3 风险路径助手消息未持久化 tool_cards; #4 error payload 泄露异常原文; #5 closed 会话无护栏; #6 emotion_tags 挂助手消息(语义); #7 风险会话摘要可能回响敏感措辞; #8 test_risk_via_llm_judgement 未 patch complete_text
- Task 5: fix round 1/5 (Important addressed: error 事件测试 5 个;附带空白孤儿会话、异常脱敏;commits 5e75f75..2be79c5)
- Task 5: complete (commits 4bf559e..2be79c5, review clean 后修复完成;主会话亲自 review 采纳)
- Task 6: complete (commits 2be79c5..be15848, 主会话亲自 TDD 实现 + 亲自 review;56 passed)
- Ruling: agent.run 仅做工具决策循环(tool_cards + tool_context),最终流式回复由 dialogue.py 负责 — 理由:避免双流式出口,职责清晰 — 若错:前端仅多一层事件顺序差异
- Ruling: record_emotion 工具不直写 emotions 表,改为触发 journal.generate(即时生成日记) — 理由:铁律"情绪记录只在生成日记时产出"不可破 — 若错:无
- Ruling: SQL Agent 用 sqlglot AST 校验 + WHERE user_id 注入 + 只读事务三层防护 — 计划文本只写"只读连接+SELECT 白名单+AST 校验",user 隔离为必要补充 — 若错:无
