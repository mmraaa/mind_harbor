from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    """聊天请求;end_session=True 表示本轮为会话收尾,触发情绪日记闭环。"""

    session_id: int | None = Field(default=None, description="已有会话 id;缺省创建新会话")
    content: str = Field(min_length=1, description="用户消息内容")
    end_session: bool = Field(default=False, description="是否结束会话并生成情绪日记")
