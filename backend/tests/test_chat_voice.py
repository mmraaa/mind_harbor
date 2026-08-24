"""POST /chat 语音流式扩展测试:voice_reply 开启 → 文本流逐句穿插 audio_chunk。

语义:回复按句子切分,每句文本输出后立即合成该句音频,以 audio_chunk{seq,text,data} 事件
紧随发出 —— 语音"跟得上"文本(句子级),而非文本整段结束才返回整段 URL。
"""

import base64
import json

from app.adapters import llm as llm_mod, tts as tts_mod


class _FakeEmo:
    is_risk = False
    category = "anxious"
    intensity = 5
    stress_source = "考试"
    support_need = "倾听"


def _token(client, username="stu1", password="pass123"):
    return client.post("/api/v1/auth/login", json={"username": username, "password": password}).json()["access_token"]


def _patch_ai(monkeypatch):
    from app.ai import agent as agent_mod, emotion as emo_mod, memory as mem_mod
    from app.ai.rag import search as rag_search_mod

    monkeypatch.setattr(emo_mod, "analyze", lambda *a, **k: _FakeEmo())
    monkeypatch.setattr(mem_mod, "assemble_context", lambda *a, **k: "上下文")
    monkeypatch.setattr(agent_mod, "run", lambda *a, **k: ([], ""))
    monkeypatch.setattr(llm_mod, "stream_chat", lambda *a, **k: iter(["今天", "心情", "不好。不过", "会好", "的。"]))
    monkeypatch.setattr(llm_mod, "chat_with_tools", lambda *a, **k: (None, []))
    monkeypatch.setattr(rag_search_mod, "search", lambda *a, **k: [])
    monkeypatch.setattr(
        tts_mod,
        "synthesize",
        lambda text, **kw: (b"A0" if "不好" in text else b"A1"),
    )


def _events(resp_text: str) -> list[dict]:
    return [json.loads(line[len("data: "):]) for line in resp_text.splitlines() if line.startswith("data: ")]


def test_chat_voice_chunks_follow_sentences(client, seed_user, monkeypatch):
    """文本句与 audio_chunk 逐句穿插:首句音频早于整段文本结束。"""
    _patch_ai(monkeypatch)
    r = client.post(
        "/api/v1/chat",
        headers={"Authorization": f"Bearer {_token(client)}"},
        json={"content": "压力好大", "voice_reply": True},
    )
    assert r.status_code == 200
    events = _events(r.text)

    texts = [e["payload"]["content"] for e in events if e["type"] == "text"]
    assert "".join(texts) == "今天心情不好。不过会好的。"

    chunks = [e for e in events if e["type"] == "audio_chunk"]
    assert len(chunks) == 2
    assert [c["payload"]["seq"] for c in chunks] == [0, 1]
    assert [c["payload"]["text"] for c in chunks] == ["今天心情不好。", "不过会好的。"]
    assert chunks[0]["payload"]["data"] == base64.b64encode(b"A0").decode()
    assert chunks[1]["payload"]["data"] == base64.b64encode(b"A1").decode()

    # “语音跟得上文本”:第一句音频块出现在整段文本结束之前
    last_text_idx = max(i for i, e in enumerate(events) if e["type"] == "text")
    first_chunk_idx = next(i for i, e in enumerate(events) if e["type"] == "audio_chunk")
    assert first_chunk_idx < last_text_idx


def test_chat_without_voice_has_no_chunks(client, seed_user, monkeypatch):
    _patch_ai(monkeypatch)
    r = client.post(
        "/api/v1/chat",
        headers={"Authorization": f"Bearer {_token(client)}"},
        json={"content": "随便聊聊"},
    )
    events = _events(r.text)
    assert not any(e["type"] == "audio_chunk" for e in events)


def test_chat_voice_skips_failed_sentence_keeps_text(client, seed_user, monkeypatch):
    _patch_ai(monkeypatch)

    def flaky(text, **kw):
        if "不好" in text:
            raise RuntimeError("TTS 429")
        return b"A1"

    monkeypatch.setattr(tts_mod, "synthesize", flaky)

    r = client.post(
        "/api/v1/chat",
        headers={"Authorization": f"Bearer {_token(client)}"},
        json={"content": "压力好大", "voice_reply": True},
    )
    events = _events(r.text)
    texts = "".join(e["payload"]["content"] for e in events if e["type"] == "text")
    assert texts == "今天心情不好。不过会好的。"  # 文本完整,不因任一句 TTS 失败丢失

    chunks = [e for e in events if e["type"] == "audio_chunk"]
    assert len(chunks) == 1  # 失败句跳过
    assert chunks[0]["payload"]["text"] == "不过会好的。"