"""CosyVoice v2 双向流式合成适配层(唯一入口)。dashscope.audio.tts_v2.SpeechSynthesizer 封装。

参考 https://help.aliyun.com/zh/model-studio/cosyvoice-python-sdk
用法(双向流式,LLM 边生成边合成):
    stt.submit(文本分片) → (on_data 音频块进队列) → stt.complete() 结束本回合
每个用户回合创建一个新实例(结束后必调 complete)。

铁律:所有 AI 能力只经 adapters 访问云服务,禁止直连供应商。
"""

import asyncio

from dashscope.audio.tts_v2 import SpeechSynthesizer

DEFAULT_MODEL = "qwen-audio-3.0-tts-flash"
DEFAULT_VOICE = "longanhuan_v3.6"


class StreamingTTS:
    """文本分片 → 音频块(经 `audio_queue()` 顺序消费);`b""` 哨兵表示结束。"""

    def __init__(self, model: str = DEFAULT_MODEL, voice: str = DEFAULT_VOICE, *, format: str = "mp3"):
        q: asyncio.Queue = asyncio.Queue()  # type: ignore[var-annotated]
        self._audio = q
        self._loop: asyncio.AbstractEventLoop | None = None
        # 模块内 `SpeechSynthesizer` 可在测试中 monkeypatch
        self._synth = SpeechSynthesizer(model=model, voice=voice, callback=self)

    def audio_queue(self) -> asyncio.Queue:
        return self._audio

    def submit(self, text: str) -> None:
        self._synth.streaming_call(text)

    def complete(self) -> None:
        self._synth.streaming_complete()

    # —— SDK 线程回调(桥接 to asyncio)——
    def on_data(self, data: bytes) -> None:
        self._post(self._audio.put_nowait, data)

    def on_complete(self) -> None:
        self._post(self._audio.put_nowait, b"")

    def on_error(self, message) -> None:  # noqa: ARG002
        self._post(self._audio.put_nowait, b"")

    def on_event(self, message: str) -> None:
        # 句子级事件(如 sentence-begin/end)留作文本对齐扩展位
        return

    def on_open(self) -> None:
        pass

    def on_close(self) -> None:
        pass

    def _post(self, fn, *args) -> None:
        """线程安全投递:优先 call_soon_threadsafe,退化为直接调用。"""
        if self._loop is None:
            try:
                self._loop = asyncio.get_running_loop()
            except RuntimeError:
                self._loop = None
        if self._loop is not None:
            self._loop.call_soon_threadsafe(fn, *args)
        else:
            fn(*args)