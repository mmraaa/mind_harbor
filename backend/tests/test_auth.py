def _login(client, username: str, password: str):
    return client.post("/api/v1/auth/login", json={"username": username, "password": password})


def test_login_success(client, seed_user):
    r = _login(client, "stu1", "pass123")
    assert r.status_code == 200
    data = r.json()
    assert data["access_token"]
    assert data["user"]["username"] == "stu1"
    assert data["user"]["role"] == "student"


def test_login_wrong_password(client, seed_user):
    assert _login(client, "stu1", "wrong").status_code == 401


def test_login_unknown_user(client):
    assert _login(client, "nobody", "x").status_code == 401


def test_me_with_token(client, seed_user):
    token = _login(client, "stu1", "pass123").json()["access_token"]
    r = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["username"] == "stu1"


def test_me_no_token(client):
    assert client.get("/api/v1/auth/me").status_code == 401


def test_me_bad_token(client):
    r = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer invalid.token.value"})
    assert r.status_code == 401


# ── PATCH /api/v1/auth/me(修改基础资料)──


def _auth_headers(client, username="stu1", password="pass123"):
    token = _login(client, username, password).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_patch_me_updates_profile(client, seed_user):
    r = client.patch(
        "/api/v1/auth/me",
        json={"name": "新昵称"},
        headers=_auth_headers(client),
    )
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "新昵称"
    assert data["username"] == "stu1"
    assert data["role"] == "student"
    # email/phone 为后续功能,当前 UserOut 不应暴露这些字段
    assert "email" not in data
    assert "phone" not in data


def test_patch_me_only_accepts_name_and_ignores_others(client, seed_user):
    """email/phone 暂不支持:传入不报错、不影响 name、不进入响应。"""
    r = client.patch(
        "/api/v1/auth/me",
        json={"name": "只改昵称", "email": "a@b.c", "phone": "13800000000"},
        headers=_auth_headers(client),
    )
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "只改昵称"
    assert "email" not in data
    assert "phone" not in data


def test_patch_me_empty_body_no_change(client, seed_user):
    r = client.patch("/api/v1/auth/me", json={}, headers=_auth_headers(client))
    assert r.status_code == 200
    assert r.json()["name"] == "测试学生"


def test_patch_me_no_token(client):
    assert client.patch("/api/v1/auth/me", json={"name": "x"}).status_code == 401


def test_patch_me_role_immutable(client, seed_user):
    r = client.patch(
        "/api/v1/auth/me", json={"role": "admin"}, headers=_auth_headers(client)
    )
    assert r.status_code == 400


def test_patch_me_username_immutable(client, seed_user):
    r = client.patch(
        "/api/v1/auth/me", json={"username": "hacked"}, headers=_auth_headers(client)
    )
    assert r.status_code == 400


# ── PUT /api/v1/auth/password(修改密码)──


def test_change_password_success(client, seed_user):
    r = client.put(
        "/api/v1/auth/password",
        json={"old_password": "pass123", "new_password": "newpass456"},
        headers=_auth_headers(client),
    )
    assert r.status_code == 200
    # 旧密码失效、新密码可登录
    assert _login(client, "stu1", "pass123").status_code == 401
    assert _login(client, "stu1", "newpass456").status_code == 200


def test_change_password_wrong_old(client, seed_user):
    r = client.put(
        "/api/v1/auth/password",
        json={"old_password": "wrong", "new_password": "newpass456"},
        headers=_auth_headers(client),
    )
    assert r.status_code == 400


def test_change_password_short_new(client, seed_user):
    r = client.put(
        "/api/v1/auth/password",
        json={"old_password": "pass123", "new_password": "123"},
        headers=_auth_headers(client),
    )
    assert r.status_code == 400


def test_change_password_no_token(client):
    assert client.put("/api/v1/auth/password", json={
        "old_password": "x", "new_password": "y" * 6
    }).status_code == 401
