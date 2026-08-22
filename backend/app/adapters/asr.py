"""FunASR 实时语音识别适配层(唯一入口)。dashscope.audio.asr.Recognition 封装。

参考 https://help.aliyun.com/zh/model-studio/fun-asr-realtime-python-sdk
用法(双向流式):
    rec.start() → 循环 rec.send_audio_frame(音频帧) → rec.stop()
识别句经回调投递到 asyncio 队列,由 `sentences()` 消费。

铁律:所有 AI 能力只经 adapters 访问云服务,禁止直连供应商。
"""

import asyncio

from dashscope.audio.asr import Recognition, RecognitionCallback, RecognitionResult

DEFAULT_MODEL = "qwen-audio-3.0-asr-flash-streaming"
DEFAULT_SAMPLE_RATE = 16000
DEFAULT_FORMAT = "pcm"


class _Callback(RecognitionCallback):
    """把 SDK 线程回调桥接为 asyncio 队列投递。"""

    def __init__(self, queue: asyncio.Queue):
        self._q = queue
        self._loop: asyncio.AbstractEventLoop | None = None

    def _post(self, obj: dict) -> None:
        """线程安全投递:优先 call_soon_threadsafe,退化为直接 put。"""
        if self._loop is None:
            try:
                self._loop = asyncio.get_running_loop()
            except RuntimeError:
                self._loop = None
        if self._loop is not None:
            self._loop.call_soon_threadsafe(self._q.put_nowait, obj)
        else:
            self._q.put_nowait(obj)

    def on_open(self) -> None:
        pass

    def on_complete(self) -> None:
        self._post({"event": "complete"})

    def on_error(self, result) -> None:  # noqa: ARG002
        self._post({"event": "error", "text": ""})

    def on_event(self, result: RecognitionResult) -> None:
        sentence = result.get_sentence()
        if not sentence or "text" not in sentence:
            return
        self._post(
            {
                "text": sentence["text"],
                "is_end": bool(RecognitionResult.is_sentence_end(sentence)),
            }
        )

    def on_close(self) -> None:
        self._post({"event": "close"})


class StreamingRecognizer:
    """上行音频帧 → 识别句;对外经 `sentences()` 队列消费。"""

    def __init__(self, model: str = DEFAULT_MODEL, *, sample_rate: int = DEFAULT_SAMPLE_RATE, format: str = DEFAULT_FORMAT):
        q: asyncio.Queue = asyncio.Queue()  # type: ignore[var-annotated]
        self._queue = q
        self._cb = _Callback(q)
        # 模块内 `Recognition` 可在测试中 monkeypatch
        self._rec = Recognition(model=model, format=format, sample_rate=sample_rate, callback=self._cb)

    def sentences(self) -> asyncio.Queue:
        return self._queue

    async def start(self) -> None:
        self._rec.start()

    async def stop(self) -> None:
        self._rec.stop()

    async def send_frame(self, data: bytes) -> None:
        self._rec.send_audio_frame(data)

    def _on_sentence(self, obj: dict) -> None:
        """测试辅助:模拟 SDK 回调直接投递一条识别结果。"""
        self._cb._post(obj)  # noqa: SLF001