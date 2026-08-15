"""学生端情绪日记 API:只读查看自己的日记(不可修改)。

注意:学生可只读查看自己的日记(2026-08-15 用户指令更新);
修改仍不开放;咨询师端学生心理管理保留(查看所有学生)。
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.emotion import Emotion, Journal
from app.models.user import User

router = APIRouter(prefix="/journals", tags=["journals"])


def _journal_out(db: Session, j: Journal, with_content: bool) -> dict:
    emo = db.query(Emotion).filter_by(journal_id=j.id).first()
    out: dict = {
        "id": j.id,
        "session_id": j.session_id,
        "summary": j.summary,
        "mood_score": j.mood_score,
        "created_at": j.created_at.isoformat() if j.created_at else None,
    }
    if with_content:
        out["content"] = j.content
    if emo is not None:
        out["emotion"] = {
            "category": emo.category,
            "intensity": emo.intensity,
            "stress_source": emo.stress_source,
            "support_need": emo.support_need,
        }
    return out


@router.get("/mine")
def my_journals(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[dict]:
    rows = (
        db.query(Journal)
        .filter_by(user_id=user.id)
        .order_by(Journal.id.desc())
        .limit(100)
        .all()
    )
    return [_journal_out(db, j, with_content=False) for j in rows]


@router.get("/mine/{journal_id}")
def my_journal_detail(
    journal_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    j = db.get(Journal, journal_id)
    if j is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "日记不存在")
    if j.user_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "无权查看该日记")
    return _journal_out(db, j, with_content=True)
