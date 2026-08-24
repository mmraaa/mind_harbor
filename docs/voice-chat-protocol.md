# MindHarbor 语音扩展(随 `/chat`,voice_reply 开关)

> 版本:v4(2026-08-24)。供前端团队实现语音开关与**句子级流式播报**;后端实现于 `dialogue.chat_stream` 流内。
> **方案**:语音是普通聊天的**可选扩展**,且为**句子级流式** —— 回复按句子切分,每句文本输出后立即合成该句音频,
> 以 `audio_chunk{seq,text,data}` 事件紧跟发出。**语音与文本同步推进,而非文本整段结束才返回整段 URL**。
> 语音输入仍由**浏览器 ASR 转文本**后照常发 `/chat`。

## 1. 完整流程

```
① 用户开启「语音回复」开关(默认关)
② 浏览器 ASR 把用户语音转文本(前端),或直接打字
③ POST /chat(SSE)携带 voice_reply: true
④ 后端:LLM 文本流按句切分 —— text 事件(逐增量)→ 句完整 → TTS 合成该句
    → audio_chunk{seq, text, data(base64 mp3)} 紧跟发出(句子级流式,语音跟得上文本)
⑤ 前端:文本增量照常渲染;audio_chunk 按 seq 顺序累积为 mp3 段并顺序播放
```

- **关键点**:① 文本不被 TTS 阻塞(逐句串行,句级延迟远小于整段);② `audio_chunk` 自带 `text`(该句文字),
  且在其文本句输出后立即到达;③ 未开启时行为与旧版完全一致,可平滑开关。

## 2. 接口变更(仅 /chat)

### POST `/api/v1/chat`(SSE)—— 新增字段

```json
{
  "content": "最近考试压力好大，想找人聊聊。",
  "session_id": null,
  "end_session": false,
  "voice_reply": true        // 新增:开启句子级流式语音
}
```

SSE 事件(新增 `audio_chunk`,其余不变):

| type | payload | 说明 |
|---|---|---|
| `text` / `tool_card` / `journal` / `error` | 同原 | 行为不变 |
| `audio_chunk` | `{seq, text, data, format}` | 仅在 `voice_reply=true` 时出现;`seq` 从 0 递增,`text` 为该句文字,`data` 为该句 mp3 的 **base64**;紧跟该句 `text` 事件之后 |

### 示例(开启语音,两句话)

```text
data: {"type": "text", "payload": {"content": "我看到你最近压力很大"}}

data: {"type": "text", "payload": {"content": "，可以先做一次深呼吸。"}}

data: {"type": "audio_chunk", "payload": {"seq": 0, "text": "我看到你最近压力很大，可以先做一次深呼吸。", "data": "<base64-mp3>", "format": "mp3"}}

data: {"type": "text", "payload": {"content": "需要的话"}}

data: {"type": "text", "payload": {"content": "随时可以跟我说。"}}

data: {"type": "audio_chunk", "payload": {"seq": 1, "text": "需要的话随时可以跟我说。", "data": "<base64-mp3>", "format": "mp3"}}
```

> 说明:句边界按中文/英文标点(。！？!?；; 换行)及 20 字上限判定;流结束时未到句界的尾句也会合成。
> 若某句 TTS 失败,该句的 `audio_chunk` 被跳过(不产出),文本不受影响。

## 3. 前端要点

- **语音输入**:浏览器 ASR(如 Web Speech API)出文本 → 前端弹"识别文本"供确认/编辑 → 作为 `content` 发 `/chat`;
- **流式播报**:收到 `audio_chunk` 后 `atob(data)` → `ArrayBuffer` → `AudioContext.decodeAudioData`,按 `seq` 顺序放播放队列
  (队列按 seq 端起播,句间无需整段等待);
- **开关**:默认关;用户开启后发送的请求带 `voice_reply:true`,界面可显示 "🔊 语音回复" 标识;
- 会话/日记/风险等语义均与文字聊天一致(同一 `POST /chat` 通道)。

## 4. 降级与边界

| 场景 | 行为 |
|---|---|
| `voice_reply` 未开启 | 与旧版一致,无 `audio_chunk` |
| 某句 TTS 失败 | 跳过该句 `audio_chunk`,文本照常、不影响后续句 |
| 风险内容命中 | 风险模板(文本)返回,不合成语音 |
| LLM 异常 | `error` 事件,消息不落残缺回复 |

## 5. 演进对照(为什么是"扩展开关 + 句子级流式")

| 演进 | 方案 | 为什么被调整 |
|---|---|---|
| v1 | WS 双向流 + 后端 FunASR | 实时双向复杂、依赖后端 ASR |
| v2 | 独立桥接 `/voice/bridge/chat` | 与 /chat 重复,合并 |
| v3 | `/chat` `voice_reply` → 流尾整段 `audio_url` | **语音等整段合成完才发,跟不上文本** |
| **v4(当前)** | `/chat` `voice_reply` → 句子级 `audio_chunk`(紧跟对应文本句) | 文本与语音逐句同步,真正"跟得上" |