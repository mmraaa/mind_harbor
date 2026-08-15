"""create_reminder 工具:创建日程提醒。"""

from datetime import datetime

from sqlalchemy.orm import Session

from app.ai.tools.registry import ToolSpec, registry
from app.models.resource import Reminder


def _reminder(
    db: Session, user_id: int, session_id: int,
    content: str, remind_at: str, **kwargs,
) -> dict:
    try:
        at = datetime.fromisoformat(remind_at)
    except ValueError as exc:
        raise ValueError(f"提醒时间格式不正确(需 ISO 8601): {remind_at}") from exc

    r = Reminder(user_id=user_id, content=content[:200], remind_at=at)
    db.add(r)
    db.commit()
    db.refresh(r)
    return {
        "type": "reminder",
        "reminder_id": r.id,
        "content": r.content,
        "remind_at": r.remind_at.isoformat(),
    }


registry.register(
    ToolSpec(
        name="create_reminder",
        description=(
            "用户提到希望在某时间被提醒(复习/运动/休息/咨询预约等)时调用,"
            "创建日程提醒。remind_at 用 ISO 8601 时间字符串(如 2026-08-16T09:00:00)。"
        ),
        parameters={
            "type": "object",
            "properties": {
                "content": {"type": "string", "description": "提醒内容"},
                "remind_at": {"type": "string", "description": "ISO 8601 提醒时间"},
            },
            "required": ["content", "remind_at"],
        },
        handler=_reminder,
    )
)
