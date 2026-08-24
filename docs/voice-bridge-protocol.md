# MindHarbor 语音助手 HTTP 桥接协议(前端交接)

> 版本:v2(2026-08-24)。对应 AI 面试官"语音桥接"功能点;后端实现于 `backend/app/api/voice.py`。
> **方案**:放弃 WS 双向流与后端 ASR,改为**浏览器完成语音识别与确认** → 文本走 HTTP 桥接,
> 后端返回流式文本 + 音频 URL。

## 1. 完整流程

```
① 浏览器 ASR(如 Web Speech API / 音频服务)把用户语音转文本
② 前端展示识别文本供用户确认
③ POST /voice/bridge/chat(携带确认后的文本)→ SSE 事件流
④ 后端:完整对话闭环 → 流式 text 事件 → TTS 合成 → audio_url 事件(文本流尾部)
⑤ 前端:文本随事件流展示;<audio src=audio_url> 播放语音(边下边播)
```

- 优势:文本与语音**不冲突、不互阻塞** —— 文本先行流式渲染,TTS 在文本完成后合成,
  音频 URL 作为流尾事件返回;前端拿到 URL 即播放,无需等待整段下载。

## 2. 接口

### POST `/api/v1/voice/bridge/chat`(SSE)

请求头:`Authorization: Bearer <token>`
请求体(JSON):

```json
{
  "content": "最近考试压力好大，想找人聊聊。",   // 必填,识别确认后的文本
  "session_id": null,                            // 可选;缺省创建新会话
  "end_session": false                           // 可选;true 结束会话并生成情绪日记
}
```

响应:`Content-Type: text/event-stream`,`data: {json}` 一行一事件,空行分隔。

| 事件 type | payload | 时机 |
|---|---|---|
| `text` | `{content}` | 逐增量,先行到达(LLM 流式) |
| `audio_url` | `{url, text, degraded?}` | 文本流完成后到达(TTS 整段合成);`url=null, degraded=true` 表示降级 |
| `journal` | 日记对象 | `end_session=true` 时,最后到达 |
| `error` | `{message}` | 生成异常;内部错误只进日志 |

### 会话与日记语义

- 首请求自动创建会话(`title=content` 前 20 字);`session_id` 复用本人 active 会话;
  已结束(`closed`)会话不可续聊(400);
- 用户文本与助手回复均落库(与文字聊天同表),历史回放一致:
- `end_session=true` → 生成情绪日记并级联情绪记录,会话置 `closed`,`journal` 事件下发;
- 风险命中:按风险模板返回文本(无音频),`risk_level=high`(与文字聊天一致)。

## 3. SSE 事件示例

```text
data: {"type": "text", "payload": {"content": "我看到你最近"}}

data: {"type": "text", "payload": {"content": "压力很大，愿意的话"}}

data: {"type": "text", "payload": {"content": "可以先做一次深呼吸。"}}

data: {"type": "audio_url", "payload": {"url": "https://.../audio.mp3", "text": "我看到你最近压力很大，愿意的话可以先做一次深呼吸。"}}
```

## 4. 前端播放建议

- `<audio autoplay src="<audio_url>">`;即将播放前 `play()`(需用户手势后调用,可绑在"确认/开始"按钮上);
- 文本直接以 `text` 事件增量渲染;
- 音频不可用(`degraded=true`)时仅保留文本,不阻塞;
- 可选:播放前显示"识别文本确认"按钮(用户确认后才发送),符合流程 ②。

## 5. 降级与边界

| 场景 | 行为 |
|---|---|
| TTS 未配置/失败 | `audio_url {url:null, degraded:true}`,文本照常 |
| LLM 异常 | `error` 事件;消息不落残缺回复 |
| 风险内容 | 风险模板文本(无音频)+ `risk_level=high` |
| 空白 content | 400「消息内容不能为空」 |

## 6. 与旧方案差异(变更说明)

| 项 | v1(已废弃,git 回退) | v2(当前) |
|---|---|---|
| 通道 | WS `/voice/ws` 双向流 | HTTP SSE `/voice/bridge/chat` |
| ASR | 后端 FunASR | **浏览器 ASR**(前端确认文本) |
| TTS | CosyVoice v2 `streaming_call` 双向流 | `tts.synthesize_with_url` 整段合成返回 URL |
| 文本/音频 | 边生成边推音频块 | 文本流先行 + 流尾 `audio_url`(不冲突) |