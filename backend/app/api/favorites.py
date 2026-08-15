"""收藏回复 API:收藏/取消/列表(仅本人)。"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.session import ChatSession, Favorite, Message
from app.models.user import User

router = APIRouter(prefix="/favorites", tags=["favorites"])


def _own_message(db: Session, message_id: int, user: User) -> Message:
    """校验消息属于本人的某会话;否则 404/403。"""
    m = db.get(Message, message_id)
    if m is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "消息不存在")
    session = db.get(ChatSession, m.session_id)
    if session is None or session.user_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "无权收藏该消息")
    return m


@router.post("/{message_id}")
def add_favorite(
    message_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    m = _own_message(db, message_id, user)
    if db.query(Favorite).filter_by(user_id=user.id, message_id=message_id).first() is None:
        db.add(Favorite(user_id=user.id, message_id=message_id))
        m.is_favorite = True
        db.commit()
    return {"message_id": message_id, "favorited": True}


@router.delete("/{message_id}")
def remove_favorite(
    message_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    fav = db.query(Favorite).filter_by(user_id=user.id, message_id=message_id).first()
    if fav is not None:
        db.delete(fav)
        m = db.get(Message, message_id)
        if m is not None:
            m.is_favorite = False
        db.commit()
    return {"message_id": message_id, "favorited": False}


@router.get("/mine")
def my_favorites(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[dict]:
    rows = (
        db.query(Favorite, Message, ChatSession)
        .join(Message, Favorite.message_id == Message.id)
        .join(ChatSession, Message.session_id == ChatSession.id)
        .filter(Favorite.user_id == user.id)
        .order_by(Favorite.id.desc())
        .limit(100)
        .all()
    )
    return [
        {
            "favorite_id": fav.id,
            "message_id": msg.id,
            "session_id": session.id,
            "session_title": session.title,
            "content": msg.content,
            "created_at": msg.created_at.isoformat() if msg.created_at else None,
        }
        for fav, msg, session in rows
    ]
