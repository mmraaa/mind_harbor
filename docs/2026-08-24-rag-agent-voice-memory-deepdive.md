# MindHarbor 核心机制深度讲解
### —— RAG / Agent / 三层记忆 / 流式语音

> 版本:v1 · 2026-08-24 · 与当前代码一一对应
> 阅读前提:对 FastAPI、SQLAlchemy、LLM 有基础认知;文中代码为源码片段/伪代码,完整实现见 `backend/app/ai/` 与 `backend/app/adapters/`。

---

## 目录

1. 引言:一份回复背后发生了什么
2. RAG 知识库(检索增强生成)
3. Agent 工具系统(function-calling 编排)
4. 三层记忆架构(短期 / 会话 / 长期)
5. TTS 流式语音(句子级跟读)
6. 一句话回顾

---

## 1. 引言:一份回复背后发生了什么

当学生发送「最近考试压力好大」,系统在**一次 SSE 请求内**依次执行:

```
情绪识别 → 风险筛查 → 记忆上下文拼装 → Agent 工具决策 → LLM 流式生成
         →(语音开)→ 句子级 TTS → 会话结束?→ 情绪日记闭环
```

本文逐个拆解其中四个最有价值的技术点,讲清楚**代码怎么写、为什么这么写**。

---

## 2. RAG 知识库

### 2.1 为什么需要 RAG

心理科普要求专业、可溯源。纯靠 LLM 记忆会"编造"就诊流程、电话、建议;纯人工检索无法承载多轮对话。RAG(检索增强生成)把**检索结果拼进提示词**,让模型"引用着回答":

- 专业内容必须命中知识库并带来源;检索不到时模型被要求**明确说"资料库暂未收录"**,而不是自行编造。

### 2.2 分块:Small-to-Big(父子分块)

知识文档是 Markdown,直接整篇向量化会超出上下文、且检索粒度太粗。项目采用**按二级标题切成语义单元**的分块(`app/ai/rag/chunking.py`)。

```python
@dataclass
class SemanticChunk:
    content: str          # 子块(向量化用),带 [文档 > 节] 前缀
    section: str
    parent_content: str   # 父块(整节全文,仅供 LLM 回查,不向量化)
    seq: int
```

核心函数 `chunk_document` 的思路(节选):

```python
doc_title, sections = _parse_h2_sections(text)      # `##` 为节边界;`#` 为文档标题
...
for section_title, body_lines in sections:
    parent_content = "\n".join(body_lines).strip()   # 父块:整节文本
    path = " > ".join(filter(None, [doc_title, section_title]))
    full = f"[{path}]\n{parent_content}"             # 子块:带层级前缀
    if len(full) > max_chars:                        # 超长节再按窗口切
        for piece in _window_split(full, max_chars, overlap):
            result.append(SemanticChunk(content=piece, ..., parent_content=parent_content, ...))
```

**为什么这样设计?**

| 权衡 | 结论与理由 |
|---|---|
| 按 `##` 切 vs 固定长度切 | `##` 切分保持"一个节 = 一个语义单元":同一话题不会因长度被割裂到不同块;检索一块即拿到节内完整逻辑 |
| 父块不向量化 | 向量检索要"小块、精确";大节直接向量化会稀释语义。所以**小块(子块)负责召回,大节(父块)负责给足上下文**——检索命中后再回查父块 |
| `[文档>节]` 前缀 | 子块自带来源脉络,检索时同名概念不容易混淆,答案也天然带出处 |
| 额外窗口切分 | 极长节(如整章)单块超限时,用 `max_chars`/`overlap` 二次切,`overlap` 缓解跨窗断句 |

### 2.3 入库管道

`app/ai/rag/ingest.py::ingest_document` 把文档变数据:

```python
chunks = chunk_document(text)              # 语义分块(父+子)
vectors = embedding.embed([c.content for c in chunks])   # 只向量化子块
# 父块:PG 存整节文本(is_parent=True)
# 子块:PG 存元数据 + Milvus 向量(is_parent=False, parent_id→父块)
# 同 source 重复入库 → 先删旧 doc/chunk/向量再写,避免脏数据
```

可靠性要点:
- **事务一致性**:向量写入失败 → 回滚本次文档全部 PG 元数据,不产生"有向量没正文"的孤儿;
- **可重建**:`purge_all_knowledge` 一键清库重灌。

### 2.4 在线检索:RRF 混合检索 + 父块回查

`app/ai/rag/search.py::search` 是查询主入口:

```python
qvec = embedding.embed([query])[0]
vec_hits = store.search(qvec, top_k * 2)      # ① 向量召回(多取,供融合)

terms = _extract_keywords(query)              # ② 关键词:连续 CJK≥2 / 英文≥3
kw_ids = PG ILIKE 命中子块 id                  # ③ 精确匹配召回

ranked = _rrf_merge(vec_hits, kw_ids)         # ④ RRF 融合
```

RRF 融合实现:

```python
def _rrf_merge(vector_hits, kw_chunk_ids, k=60):
    score = {}
    for rank, hit in enumerate(vector_hits, start=1):
        score[hit["id"]] += 1.0 / (k + rank)          # 向量路:按排名给分
    for rank, cid in enumerate(kw_chunk_ids, start=1):
        score[cid] += KEYWORD_WEIGHT / (k + rank)     # 关键词路:加权 1.5
    return sorted(score.items(), key=lambda kv: (-kv[1], kv[0]))
```

命中后回查父块拼上下文:

```python
parent = session.get(KnowledgeChunk, row.parent_id)
context = parent.content if parent else row.content    # 命中子块 → 取父块全文
ChunkHit(text=row.content, doc_title=doc.title, ..., context=context)
```

**为什么选 RRF 而不是"向量优先"或"关键词优先"?**
- 向量能抓"语义相近但字面不同"的检索;关键词 ILIKE 对精确名词(如机构名、热线、术语)更可靠;单一信号都有盲区;
- RRF 按**排名**(而非相似度绝对值)融合,天然缓解两种打分体系不可比的问题;
- 关键词加权 1.5:精确命中比向量"像但不确定"更可信,故加权重;同分时稳定排序。

**防幻觉闭环**:`search` 检索为空 → 返回 `[]`;提示词层要求模型对空命中**明说未收录**,附录来源由 `ChunkHit.doc_title` 提供。

---

## 3. Agent 工具系统

### 3.1 目标

让 LLM 不止"回答",还能**调用能力**:查知识库、写情绪记录、建提醒、给呼吸引导、统计情绪……能力统一抽象为"工具",由模型在对话中决定何时调用、传什么参数。

### 3.2 工具注册表

`app/ai/tools/registry.py` 定义工具契约:

```python
@dataclass(frozen=True)
class ToolSpec:
    name: str
    description: str          # 模型决定是否调用的依据(写清"何时该用")
    parameters: dict          # JSON Schema
    handler: Handler          # (db, user_id, session_id, **kwargs) -> dict

registry.openai_tools()   # 转成 OpenAI function-calling 的 tools 数组
```

**为什么自研注册表而非 LangGraph?**
- 教学透明:工具、提示词、调用循环都显式可见,课堂演示/调试友好;
- 课程规模下注册表 + 循环已足够,避免引入重框架的学习与运维成本。

### 3.3 function-calling 循环

`app/ai/agent.py::run` 是核心循环(简化):

```python
for _ in range(MAX_TOOL_ROUNDS):                # MAX_TOOL_ROUNDS = 3(防死循环)
    content, tool_calls = llm_adapter.chat_with_tools(messages, tools)
    messages.append({"role": "assistant", "content": content or None,
                     "tool_calls": tool_calls or None})   # 必须先入 assistant 消息
    if not tool_calls:
        break
    for call in tool_calls:                     # 一轮可调多个工具
        result = _dispatch(db, user_id, session_id, name, arguments, registry)
        messages.append({"role": "tool", "tool_call_id": call_id,
                         "content": json.dumps(result, ensure_ascii=False)})
```

要点讲解:
- **消息序列必须符合 OpenAI 规范**:`assistant`(带 tool_calls)必须先行,`tool` 结果才能挂到对应 `tool_call_id`;
- 工具结果回填 → 模型继续生成"最终回复",实现**工具与推理的多轮往返**;
- 工具异常不中断循环,返回 `{"error": ...}` 交给模型转述(降级友好)。

### 3.4 工具清单与安全分界

| 学生端 6 工具 | 咨询师端 3 工具(独立注册表) |
|---|---|
| `record_emotion` 情绪落库 · `search_knowledge` RAG · `generate_breathing` 呼吸 · `create_reminder` 提醒 · `recommend_resources` 资源 · `query_emotion_stats`(SQL Agent) | `query_student_stats`(SQL Agent,可查任意/全体) · `search_student_journals` 日记检索 · `find_at_risk_students` 异常识别 |

SQL Agent 是安全重点,采取**三层防御**(`app/ai/tools/query_emotion_stats.py`):

```python
sql = llm.complete_text(SQL_GEN_PROMPT, question, temperature=0)  # ① 模型只"翻译"
tree = _validate(sql)        # ② sqlglot AST:单条 + 必须 SELECT + 白名单表
injected = tree.where(f"user_id = {int(user_id)}").limit(100)     # ③ 强制本人 + 行数
SET TRANSACTION READ ONLY    # ④ 数据库物理拒写
```

**为什么是"模型只管翻译、系统强约束边界"?**
- 模型输出不可信,所以不放任:白名单、只读、行数、数据隔离全部在**代码层**兜底;
- 学生端注入 `user_id`(只能查自己),咨询师端不注入但入口由 `require_roles("counselor","admin")` 把关——权限按角色分层,避免混用。

---

## 4. 三层记忆架构

### 4.1 三层总览

依据 `app/ai/memory.py`:

| 层 | 存储 | 内容 | 读 | 写 |
|---|---|---|---|---|
| 短期 | `messages` | 最近 `SHORT_TERM_WINDOW=10` 轮 | 每轮拼装 | 每轮 |
| 会话摘要 | `sessions.summary` | 长会话 3–5 句第三人称摘要 | 每轮拼装 | 每满 `SUMMARY_THRESHOLD=20` 轮增量压缩 |
| 长期 | `user_memories` + 情绪聚合 | 事实/偏好 + 情绪画像(主情绪、趋势、常驻压力源) | 每轮拼装 | 规则抽取/对话结束沉淀 |

### 4.2 拼装(`assemble_context`)

```python
parts = []
if profile := _long_term_profile(db, user_id, current_text):
    parts.append("【长期记忆】\n" + profile)        # ① 长期画像(优先)
if session.summary:
    parts.append("【会话摘要】\n" + session.summary)  # ② 摘要
recent = messages[-SHORT_TERM_WINDOW:]
parts.append("【近期对话】\n" + ...)                 # ③ 短期窗口
if rag_hits:
    parts.append("【知识参考】\n" + ...)             # ④ 检索引用(RAG,可选)
```

**为什么按"长期→摘要→短期→知识"顺序?** 重要且久远的先给,近窗口随后,检索引用最后——既保证跨会话记忆,也不淹没当前上下文。

### 4.3 写侧:增量摘要 + 规则抽取

```python
if len(messages) >= SUMMARY_THRESHOLD and (not session.summary or len(messages) % SUMMARY_THRESHOLD == 0):
    if session.summary:                              # 已有摘要 → 增量合并
        session.summary = llm.complete_text(ROLLING_SUMMARY_PROMPT, 旧摘要+新增)
    else:                                            # 首次 → 生成首版
        session.summary = llm.complete_text(SUMMARY_SYSTEM_PROMPT, 近期对话)
```

长期事实用**规则抽取(不调 LLM)**沉淀:

```python
FACT_PATTERNS = [re.compile(r"我叫([一-龥]{2,8})..."),
                 re.compile(r"我是(.{1,20}?(?:专业|大一|...)")]  # 名字/年级专业
```

**为什么摘要要"增量滚动"而不每次都全量压缩?** 全量压缩随会话变长成本上升且会丢失早期细节;增量压缩(旧摘要+新增)保持 O(窗口)成本、摘要稳定。**为什么事实用规则而不用 LLM?** 名字/年级这类高置信短模式用正则更稳定、零成本、可审计;复杂的自由事实再留给 LLM。

### 4.4 情绪画像与长期沉淀

情绪记录来自对话闭环(`journals/emotions`),`_emotion_profile` 动态聚合近期记录:

```python
top_cat, cnt = Counter(e.category ...).most_common(1)[0]   # 主情绪
# 情绪趋势:近半 vs 更早半强度对比,差异 >=1 才提示
# 常驻压力源 / 支持需求:出现 >=2 次 汇总
```

会话结束时 `settle_long_term_memory` 把**稳定模式**(同一压力源 ≥3 次)沉淀为 `UserMemory(profile)`,跨会话生效。

**为什么画像"动态聚合"而不是冗余存储?** 画像随情绪记录实时变化,聚合零维护且天然一致;只有"足够稳定"的模式才固化进长期记忆,避免噪音污染。

### 4.5 隐私约束(铁律)

只沉淀对话中明确且非敏感的信息;**危机/敏感内容只做会话标记,不进长期记忆**——对心理陪伴产品是底线。

---

## 5. TTS 流式语音(句子级跟读)

### 5.1 三种方案与最终选择

| 方案 | 是什么 | 为什么被替换 |
|---|---|---|
| WS 双向流 + 后端 ASR | 音频帧上行,实时双向 | 依赖后端录音识别、链路复杂 |
| 独立桥接接口 | 单独 `/voice/bridge/chat` | 与 `/chat` 功能重复 |
| 整段合成后返回 URL | 文本结束后再给整段 mp3 | **语音跟不上文本** |
| **句子级流式(最终)** | `/chat` 加 `voice_reply`,回复按句切分,TTS 紧随对应文本句 | 语音与文本同步推进、改动最小 |

### 5.2 实现:`/chat` 流内按句合成

请求新增 `ChatRequest.voice_reply`。在 `app/ai/dialogue.py` 的回复流中:

```python
voice_on = bool(body.voice_reply)
for delta in stream_reply(content=content, context=context):
    yield _sse("text", {"content": delta})           # 文本流式,先行
    if not voice_on:
        continue
    buf += delta
    while (sentence := _take_first_sentence(buf)) is not None:   # 标点/20字为界
        buf = buf[len(sentence):]
        audio = tts.synthesize(sentence)              # 该句合成(整句 mp3)
        yield _sse("audio_chunk", {
            "seq": audio_seq, "text": sentence,
            "data": base64.b64encode(audio).decode("ascii"), "format": "mp3",
        })
        audio_seq += 1
# 流结束:未到句界的尾句也合成
```

事件序列(以两句为例):

```
text(增量...) → text(增量...) → audio_chunk{seq:0, text:"……。"} → text → ... → audio_chunk{seq:1,...}
```

前端把 `audio_chunk` 按 `seq` 解码(`atob → ArrayBuffer → decodeAudioData`)依次入播放队列——**先到的 sentence 立刻能播**,不等整段。

### 5.3 为什么采用"句子级 + base64 块"而非"流式分帧/TTS 双向"

- **句级粒度**:彻底避免"等整段",首句语音约在首句文本完成后几百毫秒到达,听感上与文字同步;
- **整句一个 `audio_chunk`**:mp3 以句为单位天然可独立解码;若把单帧拆开放行,前端反而要拼帧,且不同句的 mp3 不能无缝拼接,复杂度转移给前端不划算;
- **base64 走 SSE**:复用既有 SSE 通道(鉴权、断连、顺序保证),无需 WebSocket/新连接;句子 mp3 体积小(几 KB~几十 KB),编码虽有 ~33% 膨胀但可接受;
- **降级友好**:任一句 `synthesize` 抛异常就跳过该句(文本不受影响),风险分支不合成语音——保证"语音只是文本的增强,永远不阻塞主流程"。

### 5.4 边界与后续

- 边界:句失败跳过;空白/超长句由 `_take_first_sentence` 控制;风险内容只给文本;
- 后续可做:TTS 并行预判(边生成边预取下一句)、热点句缓存、或换 ChatGPT-音频级别的真·分帧流式——在"句级"基础上晋升,协议无需推倒。

---

## 6. 一句话回顾

```
RAG 负责「专业且可溯源」 → Agent 负责「会调能力」 → 三层记忆负责「记得起、说得清」
→ 句子级流式语音负责「听得见、跟得上」;四者全部在 adapters 适配层之上编排,
保证供应商可替换、测试可离线、边界可审计。
```

---

## 附录:关键文件索引

| 机制 | 文件 |
|---|---|
| RAG 分块/入库/检索 | `app/ai/rag/{chunking,ingest,search,milvus}.py` · `adapters/embedding.py` |
| Agent 编排/注册表/工具 | `app/ai/agent.py` · `app/ai/tools/{registry,*.py}` · `app/ai/counselor*.py` |
| SQL Agent | `app/ai/tools/query_emotion_stats.py` · `app/ai/counselor_tools.py` |
| 三层记忆 | `app/ai/memory.py` · `app/services/user_memory.py` |
| 流式语音 | `app/ai/dialogue.py`(voice_reply 分支) · `app/adapters/tts.py` · `docs/voice-chat-protocol.md` |