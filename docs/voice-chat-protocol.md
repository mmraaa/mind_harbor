# MindHarbor 语音扩展(随 `/chat`,voice_reply 开关)

> 版本:v3(2026-08-24)。供前端团队实现语音开关;后端实现于 `dialogue.stream_reply` 流内。
> **方案**:语音是普通聊天的**可选扩展**——用户开启后,`POST /chat` 在既有文本流的基础上,
> 于流尾追加 `audio_url` 事件给前端播放;语音输入仍由**浏览器 ASR 转文本**后照常发 `/chat`。

## 1. 完整流程

```
① 用户开启「语音回复」开关(默认关)
② 浏览器 ASR 把用户语音转文本(前端),或直接打字
③ POST /chat(SSE)携带 voice_reply: true
④ 后端:文本回复照常流式(text / tool_card / journal / error 事件与原来完全一致)
    文本流结束后若开启 → TTS 整段合成 → 流尾 audio_url{url,text} 事件
⑤ 前端:文本照常渲染;收到 audio_url 后用 <audio src> 播放
```

- 关键点:**文本与音频解耦、不冲突** —— 文本流不被 TTS 阻塞;`audio_url` 是附加事件,只在结尾出现;
- 未开启时行为与旧版完全一致(无 `audio_url` 事件),可平滑开关。

## 2. 接口变更(仅 /chat)

### POST `/api/v1/chat`(SSE)—— 新增字段

```json
{
  "content": "最近考试压力好大，想找人聊聊。",
  "session_id": null,
  "end_session": false,
  "voice_reply": true        // 新增:开启则流尾追加 audio_url 事件
}
```

SSE 事件(新增 `audio_url`,其余不变):

| type | payload | 说明 |
|---|---|---|
| `text` / `tool_card` / `journal` / `error` | 同原 | 行为不变 |
| `audio_url` | `{url, text, degraded?}` | 仅在 `voice_reply=true` 且文本流完成后出现;`degraded=true, url=null` 表示 TTS 失败降级 |

### 示例(开启语音)

```text
data: {"type": "text", "payload": {"content": "我看到你最近压力很大"}}

data: {"type": "text", "payload": {"content": "，可以先做一次深呼吸。"}}

data: {"type": "audio_url", "payload": {"url": "https://.../audio.mp3", "text": "我看到你最近压力很大，可以先做一次深呼吸。"}}
```

## 3. 前端要点

- **语音输入**:浏览器 ASR(如 Web Speech API)出文本 → 前端弹"识别文本"供确认/编辑 → 作为 `content` 发 `/chat`(voice_reply 可选);
- **语音播报**:收到 `audio_url` 后 `<audio autoplay src=url>`(播放需用户手势,可绑在发送按钮上);`degraded=true` 时跳过播放、仅保留文本;
- **开关**:默认关;用户开启后发送的请求带 `voice_reply:true`,界面可显示" 🔊 语音回复"标识;
- 会话/日记/风险等语义均与文字聊天一致(同一 `POST /chat` 通道)。

## 4. 降级与边界

| 场景 | 行为 |
|---|---|
| `voice_reply` 未开启 | 与旧版一致,无 `audio_url` |
| TTS 未配置/失败 | `audio_url{url:null,degraded:true}`,文本照常 |
| 风险内容命中 | 风险模板(文本)返回,不合成语音 |
| LLM 异常 | `error` 事件,消息不落残缺回复 |

## 5. 演进对照(为什么是"扩展开关"而非独立通道)

| 演进 | 方案 | 结论 |
|---|---|---|
| v1 | WS 双向流 + 后端 FunASR | 放弃(实时双向复杂、依赖后端 ASR) |
| v2 | 独立 HTTP 桥接 `/voice/bridge/chat` | 合并回 `/chat`(语音本就是文本的附加) |
| **v3(当前)** | **`/chat` 加 `voice_reply` 开关,intra-stream 追加 `audio_url`** | 文本+语音同通道、可独立开关、改动最小 |