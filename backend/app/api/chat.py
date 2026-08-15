"""聊天 API:POST /api/v1/chat 返回 SSE 流。

SSE 事件格式(ruling,必须遵守):
    每事件一行 `data: {"type": "<type>", "payload": {...}}`,后跟一个空行(`\n\n`)。
type 枚举:text(回复增量/整段)、tool_card(工具卡片)、journal(会话结束日记卡片)、error。
"""

import json
import logging

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.ai import dialogue
from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.chat import ChatRequest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])


def _format_event(evt: dict) -> str:
    return f"data: {json.dumps(evt, ensure_ascii=False)}\n\n"


@router.post("")
def chat(
    body: ChatRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """发起一次对话;返回 text / tool_card / journal / error 事件流。

    先 strip 校验内容:空白直接产出 error 事件,不创建/触碰会话(避免孤儿会话行)。
    """
    content = body.content.strip()
    session = None if not content else dialogue.get_or_create_session(db, user, body.session_id)

    def gen():
        try:
            if not content:
                yield _format_event(
                    {"type": "error", "payload": {"message": dialogue.BLANK_CONTENT_MSG}}
                )
                return
            for evt in dialogue.chat_stream(db, user, session, body):
                yield _format_event(evt)
        except Exception:  # noqa: BLE001  兜底:不因内部错误中断流;异常详情进日志,不外泄
            logger.exception(
                "聊天流处理异常(session_id=%s, user_id=%s)",
                session.id if session else None,
                user.id,
            )
            yield _format_event({"type": "error", "payload": {"message": dialogue.GENERIC_ERROR_MSG}})

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
