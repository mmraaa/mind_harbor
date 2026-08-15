"""聊天 API:POST /api/v1/chat 返回 SSE 流。

SSE 事件格式(ruling,必须遵守):
    每事件一行 `data: {"type": "<type>", "payload": {...}}`,后跟一个空行(`\n\n`)。
type 枚举:text(回复增量/整段)、tool_card(工具卡片)、journal(会话结束日记卡片)、error。
"""

import json

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.ai import dialogue
from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.chat import ChatRequest

router = APIRouter(prefix="/chat", tags=["chat"])


def _format_event(evt: dict) -> str:
    return f"data: {json.dumps(evt, ensure_ascii=False)}\n\n"


@router.post("")
def chat(
    body: ChatRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """发起一次对话;返回 text / tool_card / journal / error 事件流。"""
    session = dialogue.get_or_create_session(db, user, body.session_id)

    def gen():
        try:
            for evt in dialogue.chat_stream(db, user, session, body):
                yield _format_event(evt)
        except Exception as exc:  # noqa: BLE001  兜底:不因内部错误中断流
            yield _format_event({"type": "error", "payload": {"message": str(exc)}})

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
