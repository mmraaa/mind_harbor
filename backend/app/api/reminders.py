"""学生端日程提醒 API：查询自己的提醒列表 + 标记已完成。"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.resource import Reminder
from app.models.user import User

router = APIRouter(prefix="/reminders", tags=["reminders"])


@router.get("/mine")
def my_reminders(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[dict]:
    rows = (
        db.query(Reminder)
        .filter_by(user_id=user.id)
        .order_by(Reminder.remind_at.desc())
        .limit(100)
        .all()
    )
    return [
        {
            "id": r.id,
            "content": r.content,
            "remind_at": r.remind_at.isoformat() if r.remind_at else None,
            "done": r.done,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@router.patch("/{reminder_id}/done")
def mark_reminder_done(
    reminder_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    r = db.get(Reminder, reminder_id)
    if r is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "提醒不存在")
    if r.user_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "无权操作该提醒")
    r.done = True
    db.commit()
    return {"id": r.id, "done": True}
