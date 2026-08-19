from app.admin_module.models import ApiServiceConfig
from app.core.security import create_access_token, hash_password
from app.models.user import User


def _headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}


def _admin(db) -> User:
    user = User(
        role="admin",
        username="api-config-admin",
        name="管理员",
        password_hash=hash_password("pass123"),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def test_admin_can_update_api_config_without_reading_plaintext_key(client, db):
    admin = _admin(db)
    response = client.patch(
        "/api/v1/admin/api-configs/llm",
        headers=_headers(admin),
        json={
            "base_url": "https://primary.example.test/v1",
            "model": "primary-model",
            "api_key": "private-primary-key",
            "context_window": 8192,
            "max_tokens": 1024,
            "timeout_seconds": 30,
            "token_budget": 20000,
            "fallback": {
                "enabled": True,
                "base_url": "https://backup.example.test/v1",
                "model": "backup-model",
                "api_key": "private-backup-key",
            },
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["api_key_configured"] is True
    assert payload["api_key_masked"] != "private-primary-key"
    assert payload["fallback"]["api_key_configured"] is True
    assert "private-primary-key" not in response.text
    assert "private-backup-key" not in response.text

    stored = db.get(ApiServiceConfig, "llm")
    assert stored is not None
    assert stored.api_key_encrypted != "private-primary-key"
    assert stored.context_window == 8192

    listed = client.get("/api/v1/admin/api-configs", headers=_headers(admin))
    assert listed.status_code == 200
    llm = next(item for item in listed.json()["services"] if item["service_id"] == "llm")
    assert llm["usage"]["total_tokens"] == 0
    assert "private-primary-key" not in listed.text


def test_api_config_endpoints_reject_non_admin(client, seed_user):
    response = client.get("/api/v1/admin/api-configs", headers=_headers(seed_user))
    assert response.status_code == 403
