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
