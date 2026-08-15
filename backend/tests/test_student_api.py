"""学生端页面闭环所需 API 测试(Task 7a)。

覆盖:注册 / 会话列表与历史消息 / 学生只读自己的日记 / 收藏。
约定:不涉及 LLM;数据库走 mindharbor_test(client fixture)。
"""

from app.models.emotion import Emotion, Journal
from app.models.session import ChatSession, Favorite, Message
from app.models.user import User


def _reg(client, username="newstu", password="pass123", name="新同学"):
    return client.post(
        "/api/v1/auth/register",
        json={"username": username, "password": password, "name": name},
    )


# ---------- 注册 ----------


def test_register_creates_student_and_returns_token(client):
    r = _reg(client)
    assert r.status_code == 200
    data = r.json()
    assert data["access_token"]
    assert data["user"]["role"] == "student"
    assert data["user"]["username"] == "newstu"

    # token 可用
    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {data['access_token']}"})
    assert me.status_code == 200
    assert me.json()["name"] == "新同学"


def test_register_duplicate_username_rejected(client, seed_user):
    r = _reg(client, username="stu1")
    assert r.status_code == 409


def test_register_short_password_rejected(client):
    r = _reg(client, password="123")
    assert r.status_code == 422


# ---------- 会话列表与历史 ----------


def test_sessions_list_only_own(client, seed_user, db):
    other = db.query(User).filter_by(username="stu2").first()
    if other is None:
        other = User(role="student", username="stu2", name="他人", password_hash="x")
        db.add(other)
        db.flush()
    db.add(ChatSession(user_id=seed_user.id, title="我的会话"))
    db.add(ChatSession(user_id=other.id, title="别人的会话"))
    db.commit()

    token = client.post("/api/v1/auth/login", json={"username": "stu1", "password": "pass123"}).json()["access_token"]
    r = client.get("/api/v1/chat/sessions", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    titles = [s["title"] for s in r.json()]
    assert titles == ["我的会话"]


def test_session_messages_returns_history(client, seed_user, db):
    s = ChatSession(user_id=seed_user.id, title="会话")
    db.add(s)
    db.flush()
    db.add(Message(session_id=s.id, role="user", content="你好"))
    db.add(
        Message(session_id=s.id, role="assistant", content="我在",
                 emotion_tags=["calm"], tool_cards=[{"type": "sources", "sources": []}])
    )
    db.commit()

    token = client.post("/api/v1/auth/login", json={"username": "stu1", "password": "pass123"}).json()["access_token"]
    r = client.get(f"/api/v1/chat/sessions/{s.id}/messages", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    msgs = r.json()
    assert len(msgs) == 2
    assert msgs[0]["content"] == "你好"
    assert msgs[1]["tool_cards"][0]["type"] == "sources"


def test_session_messages_forbidden_for_others(client, seed_user, db):
    other = User(role="student", username="stu3", name="他人", password_hash="x")
    db.add(other)
    db.flush()
    s = ChatSession(user_id=other.id, title="他人的会话")
    db.add(s)
    db.commit()

    token = client.post("/api/v1/auth/login", json={"username": "stu1", "password": "pass123"}).json()["access_token"]
    r = client.get(f"/api/v1/chat/sessions/{s.id}/messages", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403


# ---------- 学生只读自己的日记 ----------


def test_journals_mine_lists_own_only(client, seed_user, db):
    other = User(role="student", username="stu4", name="他人", password_hash="x")
    db.add(other)
    db.flush()
    j1 = Journal(user_id=seed_user.id, summary="我的日记", content="今天有点累", mood_score=6)
    db.add(j1)
    db.flush()
    db.add(Emotion(user_id=seed_user.id, journal_id=j1.id, category="tired", intensity=5))
    db.add(Journal(user_id=other.id, summary="别人的日记", content="x", mood_score=8))
    db.commit()

    token = client.post("/api/v1/auth/login", json={"username": "stu1", "password": "pass123"}).json()["access_token"]
    r = client.get("/api/v1/journals/mine", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["summary"] == "我的日记"
    assert data[0]["emotion"]["category"] == "tired"


def test_journal_detail_own_and_forbidden(client, seed_user, db):
    j = Journal(user_id=seed_user.id, summary="详情", content="正文内容", mood_score=7)
    db.add(j)
    db.flush()
    db.add(Emotion(user_id=seed_user.id, journal_id=j.id, category="hopeful", intensity=6))
    other = User(role="student", username="stu5", name="他人", password_hash="x")
    db.add(other)
    db.flush()
    j2 = Journal(user_id=other.id, summary="他人", content="x", mood_score=5)
    db.add(j2)
    db.commit()

    token = client.post("/api/v1/auth/login", json={"username": "stu1", "password": "pass123"}).json()["access_token"]
    h = {"Authorization": f"Bearer {token}"}

    ok = client.get(f"/api/v1/journals/mine/{j.id}", headers=h)
    assert ok.status_code == 200
    assert ok.json()["content"] == "正文内容"

    forbidden = client.get(f"/api/v1/journals/mine/{j2.id}", headers=h)
    assert forbidden.status_code == 403


# ---------- 收藏 ----------


def test_manual_end_session_generates_journal_and_closes(client, seed_user, db, monkeypatch):
    """手动结束会话接口:生成情绪日志(Journal+Emotion 入库)→ 会话 closed → 返回日记。"""
    from app.adapters import llm as llm_mod

    def fake_complete_json(system, user, **kw):
        return {
            "journal_summary": "结束测试",
            "journal_content": "今天聊了考试,结束了这次会话。",
            "mood_score": 6,
            "emotion": {"category": "calm", "intensity": 5, "stress_source": "", "support_need": ""},
        }

    monkeypatch.setattr(llm_mod, "complete_json", fake_complete_json)

    s = ChatSession(user_id=seed_user.id, title="待结束")
    db.add(s)
    db.flush()
    db.add(Message(session_id=s.id, role="user", content="我们聊完了"))
    db.commit()

    token = client.post("/api/v1/auth/login", json={"username": "stu1", "password": "pass123"}).json()["access_token"]
    r = client.post(f"/api/v1/chat/sessions/{s.id}/end", headers={"Authorization": f"Bearer {token}"})

    assert r.status_code == 200
    data = r.json()
    assert data["journal_id"]
    assert data["emotion"]["category"] == "calm"

    from app.models.emotion import Emotion, Journal

    j = db.query(Journal).filter_by(session_id=s.id).one()
    emo = db.query(Emotion).filter_by(journal_id=j.id).one()
    assert emo.user_id == seed_user.id
    db.expire_all()  # API 用独立 session 提交,刷新缓存再断言
    assert db.get(ChatSession, s.id).status == "closed"  # 会话已结束


def test_manual_end_session_idempotent(client, seed_user, db, monkeypatch):
    """幂等:已结束会话重复调用 → 返回同一日记,不重复生成。"""
    from app.adapters import llm as llm_mod

    calls = []

    def fake_complete_json(system, user, **kw):
        calls.append(1)
        return {
            "journal_summary": "一次",
            "journal_content": "内容",
            "mood_score": 5,
            "emotion": {"category": "calm", "intensity": 4, "stress_source": "", "support_need": ""},
        }

    monkeypatch.setattr(llm_mod, "complete_json", fake_complete_json)

    s = ChatSession(user_id=seed_user.id, title="幂等")
    db.add(s)
    db.flush()
    db.add(Message(session_id=s.id, role="user", content="hi"))
    db.commit()

    token = client.post("/api/v1/auth/login", json={"username": "stu1", "password": "pass123"}).json()["access_token"]
    h = {"Authorization": f"Bearer {token}"}
    first = client.post(f"/api/v1/chat/sessions/{s.id}/end", headers=h).json()
    second = client.post(f"/api/v1/chat/sessions/{s.id}/end", headers=h).json()

    assert first["journal_id"] == second["journal_id"]
    assert len(calls) == 1  # 只生成一次


def test_manual_end_session_forbidden_for_others(client, seed_user, db):
    """他人会话结束 → 403。"""
    other = User(role="student", username="end2", name="他人", password_hash="x")
    db.add(other)
    db.flush()
    s = ChatSession(user_id=other.id, title="他人的")
    db.add(s)
    db.commit()

    token = client.post("/api/v1/auth/login", json={"username": "stu1", "password": "pass123"}).json()["access_token"]
    r = client.post(f"/api/v1/chat/sessions/{s.id}/end", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403


def test_favorite_flow(client, seed_user, db):
    s = ChatSession(user_id=seed_user.id, title="会话")
    db.add(s)
    db.flush()
    m = Message(session_id=s.id, role="assistant", content="收藏我")
    db.add(m)
    db.commit()

    token = client.post("/api/v1/auth/login", json={"username": "stu1", "password": "pass123"}).json()["access_token"]
    h = {"Authorization": f"Bearer {token}"}

    # 收藏
    r = client.post(f"/api/v1/favorites/{m.id}", headers=h)
    assert r.status_code == 200
    assert db.query(Favorite).filter_by(user_id=seed_user.id, message_id=m.id).first() is not None

    # 列表
    lst = client.get("/api/v1/favorites/mine", headers=h)
    assert lst.status_code == 200
    assert lst.json()[0]["content"] == "收藏我"

    # 取消收藏
    d = client.delete(f"/api/v1/favorites/{m.id}", headers=h)
    assert d.status_code == 200
    assert db.query(Favorite).filter_by(user_id=seed_user.id, message_id=m.id).first() is None
