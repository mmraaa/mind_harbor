import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401  注册全部模型
from app.core.config import get_settings
from app.core.database import Base, get_db
from app.core.security import hash_password
from app.main import app
from app.models.user import User


@pytest.fixture
def engine():
    s = get_settings()
    test_db = os.environ.get("POSTGRES_TEST_DB", "mindharbor_test")
    url = (
        f"postgresql+psycopg://{s.postgres_user}:{s.postgres_password}"
        f"@{s.postgres_host}:{s.postgres_port}/{test_db}"
    )
    eng = create_engine(url)
    Base.metadata.drop_all(eng)
    Base.metadata.create_all(eng)
    yield eng
    Base.metadata.drop_all(eng)


@pytest.fixture(autouse=True)
def disable_lan_sync_during_tests(monkeypatch):
    """测试库必须隔离,任何回归测试都不得写入局域网数据库。"""
    monkeypatch.setenv("SYNC_ENABLED", "false")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def db(engine):
    factory = sessionmaker(bind=engine)
    session = factory()
    yield session
    session.rollback()
    session.close()


@pytest.fixture
def client(engine):
    """测试客户端:get_db 依赖切换到测试库。"""
    factory = sessionmaker(bind=engine)

    def override_get_db():
        session = factory()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def seed_user(db):
    user = User(
        role="student",
        username="stu1",
        name="测试学生",
        password_hash=hash_password("pass123"),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
