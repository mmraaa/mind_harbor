"""StreamingTTS 测试:CosyVoice v2 双向流式合成封装(monkeypatch,不真实调用)。"""

import asyncio

import pytest

from app.adapters import tts_v2 as tts_mod

instances: list[object] = []


class FakeSynth:
    """替身:dashscope.audio.tts_v2.SpeechSynthesizer(不联网)。"""

    def __init__(self, **kw):
        self.kw = kw
        self.cb = kw["callback"]
        self.submitted: list[str] = []
        self.completed = 0
        instances.append(self)

    def streaming_call(self, text: str) -> None:
        self.submitted.append(text)

    def streaming_complete(self) -> None:
        self.completed += 1


@pytest.fixture
def fake_synth(monkeypatch):
    instances.clear()
    monkeypatch.setattr(
        tts_mod,
        "SpeechSynthesizer",
        lambda **kw: (
            instances.append(FakeSynth(**kw)),
            instances[-1],
        )[1],
    )
    return instances


@pytest.mark.asyncio
async def test_streaming_tts_submits_text_and_completes(fake_synth):
    stt = tts_mod.StreamingTTS(model="m", voice="v")
    stt.submit("你好")
    stt.submit("继续")
    stt.complete()

    inst = instances[0]
    assert inst.submitted == ["你好", "继续"]
    assert inst.completed == 1


@pytest.mark.asyncio
async def test_streaming_tts_audio_data_reaches_queue(fake_synth):
    stt = tts_mod.StreamingTTS(model="m", voice="v")
    # 模拟 SDK 线程回调投递音频块
    stt.on_data(b"\x00\x01\x02")
    stt.on_complete()

    q = stt.audio_queue()
    got = await asyncio.wait_for(q.get(), timeout=1)
    assert got == b"\x00\x01\x02"
    got2 = await asyncio.wait_for(q.get(), timeout=1)
    assert got2 == b""  # complete 哨兵