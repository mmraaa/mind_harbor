"""StreamingRecognizer 测试:FunASR 实时识别封装(monkeypatch dashscope,不真实调用)。"""

import asyncio

import pytest

from app.adapters import asr as asr_mod


class FakeRecognition:
    """替身:dashscope.audio.asr.Recognition 的最小实现(不联网)。"""

    def __init__(self, **kw):
        self.cb = kw["callback"]
        self.frames: list[bytes] = []

    def start(self):
        pass

    def send_audio_frame(self, data: bytes):
        self.frames.append(data)

    def stop(self):
        pass


@pytest.fixture
def fake_recognition(monkeypatch):
    monkeypatch.setattr(asr_mod, "Recognition", FakeRecognition)


@pytest.mark.asyncio
async def test_streaming_asr_delivers_sentence(fake_recognition):
    rec = asr_mod.StreamingRecognizer(model="m", sample_rate=16000)
    # 模拟 SDK 回调投递识别句 → 应出现在对外队列
    rec._on_sentence({"text": "你好", "is_end": True})
    got = await asyncio.wait_for(rec.sentences().get(), timeout=1)
    assert got == {"text": "你好", "is_end": True}


@pytest.mark.asyncio
async def test_streaming_asr_forwards_frames_to_sdk(fake_recognition):
    rec = asr_mod.StreamingRecognizer(model="m")
    await rec.start()
    await rec.send_frame(b"\x00" * 1600)
    await rec.send_frame(b"\xff" * 3200)
    await rec.stop()
    assert isinstance(rec._rec, FakeRecognition)
    assert rec._rec.frames == [b"\x00" * 1600, b"\xff" * 3200]