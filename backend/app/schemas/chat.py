from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    """聊天请求;end_session=True 表示本轮为会话收尾,触发情绪日记闭环。"""

    session_id: int | None = Field(default=None, description="已有会话 id;缺省创建新会话")
    # 不放 min_length:空白内容在路由层 strip 后统一拒绝(产出 SSE error 事件,不建会话)
    content: str = Field(description="用户消息内容(空白内容将被拒绝)")
    end_session: bool = Field(default=False, description="是否结束会话并生成情绪日记")
    voice_reply: bool = Field(
        default=False,
        description="语音扩展开关:开启后在文本回复基础上额外生成 audio_url 事件(TTS 整段合成)",
    )
