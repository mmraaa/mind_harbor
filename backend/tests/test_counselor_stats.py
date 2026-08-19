"""咨询师端多维度统计接口测试。"""

import pytest

from app.core.security import hash_password
from app.models.emotion import Emotion, Journal
from app.models.session import ChatSession, Message
from app.models.user import User


@pytest.fixture
def seed_counselor(db):
    u = User(role="counselor", username="counselor", name="咨询师", password_hash=hash_password("counselor123"))
    db.add(u)
    db.commit()
    return u


def _login(client):
    r = client.post("/api/v1/auth/login", json={"username": "counselor", "password": "counselor123"})
    assert r.status_code == 200
    return r.json()["access_token"]


def _seed_student_data(db):
    u = User(role="student", username="stuA", name="同学甲", password_hash="x")
    db.add(u)
    db.flush()
    db.add_all(
        [
            Emotion(user_id=u.id, category="anxious", intensity=8, stress_source="考试"),
            Emotion(user_id=u.id, category="hopeful", intensity=6),
        ]
    )
    db.add(Journal(user_id=u.id, summary="考前焦虑", content="有点慌", mood_score=5))
    risky = ChatSession(user_id=u.id, title="风险会话", risk_level="high", summary="触发危机关键词")
    db.add(risky)
    db.flush()
    db.add_all(
        [
            Message(session_id=risky.id, role="user", content="我好难受，不想活了"),
            Message(session_id=risky.id, role="assistant", content="请先联系危机干预热线 400-161-9995。"),
        ]
    )
    db.add(ChatSession(user_id=u.id, title="普通会话", risk_level="low"))
    db.commit()
    return u


def test_emotion_distribution(client, db, seed_counselor, seed_user):
    _seed_student_data(db)
    r = client.get("/api/v1/counselor/stats/emotion-distribution?days=30",
                   headers={"Authorization": f"Bearer {_login(client)}"})
    d = r.json()
    by = {x["category"]: x["count"] for x in d["distribution"]}
    assert by["anxious"] >= 1
    assert len(d["distribution"]) == 7  # 固定枚举补齐


def test_students_and_detail(client, db, seed_counselor, seed_user):
    u = _seed_student_data(db)
    token = _login(client)
    h = {"Authorization": f"Bearer {token}"}

    students = client.get("/api/v1/counselor/stats/students?risk=high", headers=h).json()
    assert any(s["name"] == "同学甲" for s in students["students"])

    detail = client.get(f"/api/v1/counselor/stats/students/{u.id}/detail", headers=h)
    assert detail.status_code == 200
    body = detail.json()
    assert len(body["emotion_series"]) >= 2
    assert body["journals"][0]["summary"] == "考前焦虑"
    assert body["journals"][0]["content"] == "有点慌"
    assert body["student"]["role"] == "student"
    assert body["student"]["username"] == "stuA"
    assert body["profile"]["session_count"] >= 2
    assert body["profile"]["journal_count"] >= 1
    assert len(body["emotion_trend"]) >= 1
    assert any(s["title"] == "风险会话" and s["message_count"] >= 2 for s in body["sessions"])


def test_session_messages(client, db, seed_counselor, seed_user):
    u = _seed_student_data(db)
    token = _login(client)
    h = {"Authorization": f"Bearer {token}"}
    risky = db.query(ChatSession).filter_by(user_id=u.id, risk_level="high").one()

    msgs = client.get(f"/api/v1/counselor/stats/sessions/{risky.id}/messages", headers=h)
    assert msgs.status_code == 200
    contents = [m["content"] for m in msgs.json()["messages"]]
    assert any("不想活" in c for c in contents)
    assert any("400-161-9995" in c for c in contents)


def test_session_messages_requires_counselor(client, db, seed_counselor, seed_user):
    u = _seed_student_data(db)
    risky = db.query(ChatSession).filter_by(user_id=u.id, risk_level="high").one()
    token = client.post("/api/v1/auth/login", json={"username": "stu1", "password": "pass123"}).json()["access_token"]
    r = client.get(
        f"/api/v1/counselor/stats/sessions/{risky.id}/messages",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 403


def test_stats_requires_counselor(client, seed_user, db):
    token = client.post("/api/v1/auth/login", json={"username": "stu1", "password": "pass123"}).json()["access_token"]
    r = client.get("/api/v1/counselor/stats/students", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403
