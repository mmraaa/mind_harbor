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


def test_resolve_service_falls_back_to_env_when_db_key_undecryptable(db, monkeypatch):
    """DB 配置行存在但 api_key 无法解密(如加密用密钥与当前 JWT 不一致)时,
    应回退环境变量,而不是把服务误判为'未配置'。"""
    from app.core.config import get_settings
    from app.services import api_config as mod

    monkeypatch.setattr(mod, "SessionLocal", lambda: db)
    db.add(
        ApiServiceConfig(
            service_id="llm",
            label="对话模型",
            enabled=True,
            base_url="https://db.example/v1",
            model="db-model",
            # 该串无法用当前 JWT 派生的 Fernet 密钥解密 → decrypt_secret 返回 ""
            api_key_encrypted="not-a-valid-fernet-token",
        )
    )
    db.commit()

    settings = get_settings()
    monkeypatch.setattr(settings, "llm_api_key", "env-fallback-key")

    svc = mod.resolve_service("llm")
    assert svc.api_key == "env-fallback-key"
    assert svc.base_url == settings.llm_base_url
