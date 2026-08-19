from app.admin_module import sync as sync_module
from app.core.security import create_access_token, hash_password
from app.models.user import User


def _headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}


def _admin(db) -> User:
    user = User(
        role="admin",
        username="integration-admin",
        name="管理员",
        password_hash=hash_password("pass123"),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def test_admin_resource_write_reports_lan_sync_failure(client, db, monkeypatch):
    admin = _admin(db)
    monkeypatch.setattr(sync_module, "sync_resource", lambda resource: (_ for _ in ()).throw(sync_module.LanSyncError("offline")))
    monkeypatch.setattr(sync_module, "sync_enabled", lambda: True)

    response = client.post(
        "/api/v1/admin/resources",
        headers=_headers(admin),
        json={"title": "同步测试", "type": "article", "content": "内容", "url": "", "is_active": True},
    )

    assert response.status_code == 502
    assert "局域网数据库同步失败" in response.json()["detail"]


def test_admin_api_status_is_safe_and_reports_configured_services(client, db, monkeypatch):
    admin = _admin(db)
    monkeypatch.setattr(
        "app.admin_module.sync.service_status",
        lambda: {
            "services": [
                {
                    "id": "llm",
                    "label": "对话模型",
                    "status": "configured",
                    "model": "glm-5",
                    "base_url": "https://example.test/compatible-mode/v1",
                }
            ],
            "lan_sync": {"status": "disabled"},
        },
    )

    response = client.get("/api/v1/admin/api-status", headers=_headers(admin))

    assert response.status_code == 200
    body = response.json()
    assert body["services"][0]["model"] == "glm-5"
    assert "api_key" not in response.text
