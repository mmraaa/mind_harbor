from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.database import get_db
from app.models.user import User
from app.services import user_memory

router = APIRouter(prefix="/profile/memory", tags=["memory"])


class MemoryCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: str = Field(min_length=1, max_length=1000)


class MemoryUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: str | None = Field(default=None, min_length=1, max_length=1000)


class MemorySettingsUpdate(BaseModel):
    enabled: bool


def _student(user: User = Depends(require_roles("student"))) -> User:
    return user


@router.get("")
def list_my_memories(user: User = Depends(_student), db: Session = Depends(get_db)) -> dict:
    return user_memory.memory_payload(db, user.id)


@router.post("/settings")
def update_memory_settings(body: MemorySettingsUpdate, user: User = Depends(_student), db: Session = Depends(get_db)) -> dict:
    enabled = user_memory.set_memory_enabled(db, user.id, body.enabled)
    db.commit()
    return {"enabled": enabled}


@router.post("/refresh-summary")
def refresh_my_memory_summary(user: User = Depends(_student), db: Session = Depends(get_db)) -> dict:
    try:
        user_memory.refresh_summary(db, user.id)
        db.commit()
        return user_memory.memory_payload(db, user.id)
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "记忆摘要暂时无法生成") from exc


@router.get("/{memory_id}")
def get_my_memory(memory_id: int, user: User = Depends(_student), db: Session = Depends(get_db)) -> dict:
    item = user_memory._get_item(db, user.id, memory_id)
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "记忆不存在")
    return {"item": user_memory.item_payload(item)}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_my_memory(body: MemoryCreate, user: User = Depends(_student), db: Session = Depends(get_db)) -> dict:
    try:
        item = user_memory.create_manual_memory(db, user.id, body.content)
        db.commit()
        db.refresh(item)
        return {"item": user_memory.item_payload(item)}
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc


@router.patch("/{memory_id}")
def update_my_memory(memory_id: int, body: MemoryUpdate, user: User = Depends(_student), db: Session = Depends(get_db)) -> dict:
    try:
        item = user_memory.update_memory(db, user.id, memory_id, **body.model_dump(exclude_unset=True))
        db.commit()
        db.refresh(item)
        return {"item": user_memory.item_payload(item)}
    except LookupError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc


@router.delete("/{memory_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_my_memory(memory_id: int, user: User = Depends(_student), db: Session = Depends(get_db)) -> None:
    try:
        user_memory.delete_memory(db, user.id, memory_id)
        db.commit()
    except LookupError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def clear_my_memories(user: User = Depends(_student), db: Session = Depends(get_db)) -> None:
    user_memory.clear_memories(db, user.id)
    db.commit()
