"""POST /chat 语音扩展测试:voice_reply 开关 → 文本流后追加 audio_url 事件。"""

import json

from app.ai import rag as rag_mod
from app.adapters import llm as llm_mod, tts as tts_mod


class _FakeEmo:
    is_risk = False
    category = "anxious"
    intensity = 5
    stress_source = "考试"
    support_need = "倾听"


def _token(client, username="stu1", password="pass123"):
    return client.post("/api/v1/auth/login", json={"username": username, "password": password}).json()["access_token"]


def _patch_ai(monkeypatch, url="https://example.com/voice.mp3"):
    from app.ai import agent as agent_mod, emotion as emo_mod, memory as mem_mod
    from app.ai.rag import search as rag_search_mod

    monkeypatch.setattr(emo_mod, "analyze", lambda *a, **k: _FakeEmo())
    monkeypatch.setattr(mem_mod, "assemble_context", lambda *a, **k: "上下文")
    monkeypatch.setattr(agent_mod, "run", lambda *a, **k: ([], ""))
    monkeypatch.setattr(llm_mod, "stream_chat", lambda *a, **k: iter(["语音", "回复。"]))
    monkeypatch.setattr(llm_mod, "chat_with_tools", lambda *a, **k: (None, []))
    monkeypatch.setattr(rag_search_mod, "search", lambda *a, **k: [])
    monkeypatch.setattr(
        tts_mod,
        "synthesize_with_url",
        lambda text, **kw: {"audio": b"fake", "url": url},
    )


def _events(resp_text: str) -> list[dict]:
    return [json.loads(line[len("data: "):]) for line in resp_text.splitlines() if line.startswith("data: ")]


def test_chat_voice_reply_yields_audio_url_after_text(client, seed_user, monkeypatch):
    _patch_ai(monkeypatch)
    r = client.post(
        "/api/v1/chat",
        headers={"Authorization": f"Bearer {_token(client)}"},
        json={"content": "最近压力好大", "voice_reply": True},
    )
    assert r.status_code == 200
    events = _events(r.text)

    texts = [e["payload"]["content"] for e in events if e["type"] == "text"]
    assert "".join(texts) == "语音回复。"  # 文本照常流式

    audio = [e for e in events if e["type"] == "audio_url"]
    assert len(audio) == 1
    assert audio[0]["payload"]["url"] == "https://example.com/voice.mp3"
    assert audio[0]["payload"]["text"] == "语音回复。"


def test_chat_without_voice_has_no_audio_url(client, seed_user, monkeypatch):
    _patch_ai(monkeypatch)
    r = client.post(
        "/api/v1/chat",
        headers={"Authorization": f"Bearer {_token(client)}"},
        json={"content": "随便聊聊"},
    )
    events = _events(r.text)
    assert not any(e["type"] == "audio_url" for e in events)  # 默认不合成,回归保护


def test_chat_voice_degrades_when_tts_fails(client, seed_user, monkeypatch):
    def boom(text, **kw):
        raise RuntimeError("TTS 404")

    _patch_ai(monkeypatch)
    monkeypatch.setattr(tts_mod, "synthesize_with_url", boom)

    r = client.post(
        "/api/v1/chat",
        headers={"Authorization": f"Bearer {_token(client)}"},
        json={"content": "压力好大", "voice_reply": True},
    )
    events = _events(r.text)
    audio = [e for e in events if e["type"] == "audio_url"]
    assert len(audio) == 1
    assert audio[0]["payload"]["url"] is None
    assert audio[0]["payload"]["degraded"] is True
    assert any(e["type"] == "text" for e in events)  # 文本不因 TTS 失败而缺失