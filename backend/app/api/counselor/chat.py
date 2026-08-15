"""咨询师端对话 Agent API:POST /api/v1/counselor/chat(SSE)。

权限:仅 counselor / admin。工具集为咨询师专属(counselor_registry):
查学生情绪统计(SQL Agent)/ 学生日记 / 异常学生识别。无情绪日记生成、无学生会话。
"""

import json
import logging

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.ai import agent
from app.ai import counselor_tools  # noqa: F401  导入即注册咨询师工具
from app.ai.counselor import COUNSELOR_SYSTEM_PROMPT, counselor_registry
from app.api.deps import require_roles
from app.core.database import get_db
from app.models.user import User
from app.schemas.chat import ChatRequest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/counselor", tags=["counselor"])


def _format_event(evt: dict) -> str:
    return f"data: {json.dumps(evt, ensure_ascii=False)}\n\n"


@router.post("/chat")
def counselor_chat(
    body: ChatRequest,
    user: User = Depends(require_roles("counselor", "admin")),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """咨询师自然语言查询学生情绪/日记/统计;返回 text / tool_card / error 事件流。"""
    content = body.content.strip()

    def gen():
        try:
            if not content:
                yield _format_event({"type": "error", "payload": {"message": "请输入要查询的问题"}})
                return
            # Agent 工具循环(咨询师专属注册表)
            cards, tool_context = agent.run(
                db, user.id, None, content, COUNSELOR_SYSTEM_PROMPT, "",
                registry=counselor_registry,
            )
            for card in cards:
                yield _format_event({"type": "tool_card", "payload": card})
            # 流式回复(基于工具结果总结)
            from app.adapters import llm

            prompt = COUNSELOR_SYSTEM_PROMPT + ("\n\n" + tool_context if tool_context else "")
            for delta in llm.stream_chat(
                [{"role": "system", "content": prompt}, {"role": "user", "content": content}]
            ):
                yield _format_event({"type": "text", "payload": {"content": delta}})
        except Exception:  # noqa: BLE001  兜底
            logger.exception("咨询师 Agent 处理异常(user_id=%s)", user.id)
            yield _format_event({"type": "error", "payload": {"message": "查询过程出现异常,请稍后重试"}})

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
