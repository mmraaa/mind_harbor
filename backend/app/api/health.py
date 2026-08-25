from fastapi import APIRouter, HTTPException, status
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.core.database import SessionLocal

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict:
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "数据库暂时无法连接，请确认已连接团队网络后重试",
        ) from exc
    return {"status": "ok", "database": "connected"}
