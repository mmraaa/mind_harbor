"""语音桥接 HTTP 接口测试:文本(浏览器 ASR)→ 桥接 → 流式 text + 音频 URL。

对应 AI 面试官"语音桥接"功能点:前端负责 ASR 与确认,后端负责文本业务与 TTS URL。
"""

import json

from app.models.session import ChatSession
from app.models.user import User


class _Emo:
    is_risk = False
    category = "anxious"
    intensity = 5
    stress_source = "考试"
    support_need = "倾听"


def _patch_ai(monkeypatch):
    from app.ai import agent as agent_mod, emotion as emo_mod, memory as mem_mod
    from app.adapters import llm as llm_mod, tts as tts_mod

    monkeypatch.setattr(emo_mod, "analyze", lambda *a, **k: _Emo())
    monkeypatch.setattr(mem_mod, "assemble_context", lambda *a, **k: "上下文")
    monkeypatch.setattr(agent_mod, "run", lambda *a, **k: ([], ""))
    monkeypatch.setattr(llm_mod, "stream_chat", lambda *a, **k: iter(["语音", "回复。"]))
    monkeypatch.setattr(
        tts_mod,
        "synthesize_with_url",
        lambda text, **kw: {"audio": b"fake", "url": "https://example.com/audio.mp3"},
    )


def _token(client, username="stu1", password="pass123"):
    r = client.post("/api/v1/auth/login", json={"username": username, "password": password})
    return r.json()["access_token"]


def _sse_events(text: str) -> list[dict]:
    return [json.loads(line[len("data: "):]) for line in text.splitlines() if line.startswith("data: ")]


def test_bridge_chat_streams_text_then_audio_url(client, seed_user, monkeypatch):
    _patch_ai(monkeypatch)
    r = client.post(
        "/api/v1/voice/bridge/chat",
        headers={"Authorization": f"Bearer {_token(client)}"},
        json={"content": "这段时间很难熬。"},
    )
    assert r.status_code == 200
    events = _sse_events(r.text)

    texts = [e["payload"]["content"] for e in events if e["type"] == "text"]
    assert "".join(texts) == "语音回复。"  # 文本流式先行

    audio = [e for e in events if e["type"] == "audio_url"]
    assert len(audio) == 1
    assert audio[0]["payload"]["url"] == "https://example.com/audio.mp3"
    assert audio[0]["payload"]["text"] == "语音回复。"


def test_bridge_chat_reuses_session_and_persists_messages(client, seed_user, monkeypatch):
    _patch_ai(monkeypatch)
    token = _token(client)
    h = {"Authorization": f"Bearer {token}"}

    client.post("/api/v1/voice/bridge/chat", headers=h, json={"content": "第一句。"})
    sessions = client.get("/api/v1/chat/sessions?status=active", headers=h).json()
    s1 = sessions["items"][0]
    assert s1["title"].startswith("第一句")

    client.post(
        "/api/v1/voice/bridge/chat", headers=h, json={"content": "第二句。", "session_id": s1["id"]}
    )
    payload = client.get(f"/api/v1/chat/sessions/{s1['id']}/messages", headers=h).json()
    msgs = payload["items"] if isinstance(payload, dict) else payload
    roles = [m["role"] for m in msgs]
    assert roles == ["user", "assistant", "user", "assistant"]


def test_bridge_chat_risk_uses_template_without_audio(client, seed_user, monkeypatch):
    from app.ai import emotion as emo_mod
    from app.ai.emotion import RISK_REPLY_TEMPLATE

    class _Risky(_Emo):
        is_risk = True

    monkeypatch.setattr(emo_mod, "analyze", lambda *a, **k: _Risky())

    r = client.post(
        "/api/v1/voice/bridge/chat",
        headers={"Authorization": f"Bearer {_token(client)}"},
        json={"content": "我不想活了"},
    )
    events = _sse_events(r.text)
    texts = [e["payload"]["content"] for e in events if e["type"] == "text"]
    assert texts == [RISK_REPLY_TEMPLATE]
    assert not any(e["type"] == "audio_url" for e in events)


def test_bridge_chat_end_generates_journal_and_closes_session(client, seed_user, db, monkeypatch):
    from app.models.emotion import Emotion, Journal

    _patch_ai(monkeypatch)
    r = client.post(
        "/api/v1/voice/bridge/chat",
        headers={"Authorization": f"Bearer {_token(client)}"},
        json={"content": "结束吧", "end_session": True},
    )
    events = _sse_events(r.text)
    assert any(e["type"] == "journal" for e in events)

    s = db.query(ChatSession).filter_by(user_id=seed_user.id).order_by(ChatSession.id.desc()).first()
    assert s is not None and s.status == "closed"
    j = db.query(Journal).filter_by(session_id=s.id).first()
    assert j is not None
    assert db.query(Emotion).filter_by(journal_id=j.id).count() == 1