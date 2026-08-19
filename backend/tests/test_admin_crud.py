from app.core.security import create_access_token, hash_password
from app.models.resource import Resource
from app.models.user import User


def _headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}


def _user(db, *, username: str, role: str, name: str) -> User:
    user = User(
        username=username,
        role=role,
        name=name,
        password_hash=hash_password("pass123"),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def test_admin_api_rejects_non_admin(client, db, seed_user):
    response = client.get("/api/v1/admin/students", headers=_headers(seed_user))
    assert response.status_code == 403


def test_admin_overview_is_aggregated_only(client, db):
    admin = _user(db, username="admin", role="admin", name="管理员")
    response = client.get("/api/v1/admin/overview", headers=_headers(admin))
    assert response.status_code == 200
    body = response.json()
    assert {"students", "counselors", "resources", "active_resources"} <= body.keys()
    assert "journals" not in body
    assert "messages" not in body
    assert "emotion_series" not in body


def test_admin_can_create_edit_and_disable_counselor(client, db):
    admin = _user(db, username="admin", role="admin", name="管理员")
    headers = _headers(admin)

    created = client.post(
        "/api/v1/admin/counselors",
        headers=headers,
        json={
            "username": "counselor-new",
            "password": "pass123",
            "name": "林晓",
            "title": "国家二级心理咨询师",
            "specialty": "学业压力, 睡眠",
            "bio": "专注青年成长",
            "availability": "工作日 09:00-17:00",
        },
    )
    assert created.status_code == 201
    item = created.json()
    assert item["role"] == "counselor"
    assert item["availability"] == "工作日 09:00-17:00"

    updated = client.patch(
        f"/api/v1/admin/counselors/{item['user_id']}",
        headers=headers,
        json={"specialty": "人际关系", "is_enabled": False},
    )
    assert updated.status_code == 200
    assert updated.json()["specialty"] == "人际关系"
    assert updated.json()["is_enabled"] is False

    login = client.post(
        "/api/v1/auth/login",
        json={"username": "counselor-new", "password": "pass123"},
    )
    assert login.status_code == 403


def test_admin_can_search_edit_and_disable_students_without_private_content(client, db):
    admin = _user(db, username="admin", role="admin", name="管理员")
    student = _user(db, username="student-a", role="student", name="阿南")
    _user(db, username="student-b", role="student", name="小禾")
    headers = _headers(admin)

    listing = client.get(
        "/api/v1/admin/students?keyword=阿南",
        headers=headers,
    )
    assert listing.status_code == 200
    body = listing.json()
    assert body["total"] == 1
    assert body["items"][0]["username"] == "student-a"
    assert "journals" not in body["items"][0]
    assert "messages" not in body["items"][0]

    updated = client.patch(
        f"/api/v1/admin/students/{student.id}",
        headers=headers,
        json={"risk_tags": ["关注", "睡眠"], "is_enabled": False},
    )
    assert updated.status_code == 200
    assert updated.json()["risk_tags"] == ["关注", "睡眠"]
    assert updated.json()["is_enabled"] is False

    login = client.post(
        "/api/v1/auth/login",
        json={"username": "student-a", "password": "pass123"},
    )
    assert login.status_code == 403


def test_admin_can_manage_resources(client, db):
    admin = _user(db, username="admin", role="admin", name="管理员")
    headers = _headers(admin)

    created = client.post(
        "/api/v1/admin/resources",
        headers=headers,
        json={
            "title": "考试焦虑自助清单",
            "type": "article",
            "content": "从呼吸开始，逐步拆解压力。",
            "url": "https://example.com/resource",
            "is_active": True,
        },
    )
    assert created.status_code == 201
    resource_id = created.json()["id"]

    updated = client.patch(
        f"/api/v1/admin/resources/{resource_id}",
        headers=headers,
        json={"title": "考试焦虑练习", "is_active": False},
    )
    assert updated.status_code == 200
    assert updated.json()["title"] == "考试焦虑练习"
    assert updated.json()["is_active"] is False

    listing = client.get("/api/v1/admin/resources", headers=headers)
    assert listing.status_code == 200
    assert any(row["id"] == resource_id for row in listing.json()["items"])

    deleted = client.delete(f"/api/v1/admin/resources/{resource_id}", headers=headers)
    assert deleted.status_code == 204
