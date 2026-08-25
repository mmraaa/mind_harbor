from fastapi import HTTPException, status
from sqlalchemy import create_engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import get_settings

settings = get_settings()
engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_timeout=settings.postgres_connect_timeout_seconds,
    connect_args={"connect_timeout": settings.postgres_connect_timeout_seconds},
)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


class Base(DeclarativeBase):
    """所有 ORM 模型的基类。"""


def get_db():
    """FastAPI 依赖:提供一个请求级数据库会话。"""
    db = SessionLocal()
    try:
        # Open the connection at the request boundary. A failed remote database
        # then becomes a clear, fast 503 instead of a late login-page timeout.
        db.connection()
    except SQLAlchemyError as exc:
        db.close()
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "数据库暂时无法连接，请确认已连接团队网络后重试",
        ) from exc
    try:
        yield db
    finally:
        db.close()
