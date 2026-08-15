"""TTS 适配层:所有语音合成只经此模块,禁止直连具体供应商。

OpenAI 兼容 audio/speech 协议:
    POST {base_url}/audio/speech
    {"model": ..., "input": text, "voice": ..., "response_format": "mp3"}

配置字段来自 `app.core.config.Settings`:`tts_api_key` / `tts_base_url` /
`tts_model` / `tts_voice`(环境变量 `TTS_API_KEY` / `TTS_BASE_URL` /
`TTS_MODEL` / `TTS_VOICE`);key 缺失抛清晰 RuntimeError。
"""

import httpx

from app.core.config import get_settings

TTS_TIMEOUT_SECONDS = 60


def _client_config() -> tuple[str, str, str]:
    s = get_settings()
    if not s.tts_api_key:
        raise RuntimeError("TTS 未配置:请设置环境变量 TTS_API_KEY")
    if not s.tts_base_url:
        raise RuntimeError("TTS 未配置:请设置环境变量 TTS_BASE_URL")
    if not s.tts_model:
        raise RuntimeError("TTS 未配置:请设置环境变量 TTS_MODEL")
    return s.tts_api_key, s.tts_base_url, s.tts_model


def synthesize(text: str, *, voice: str | None = None) -> bytes:
    """文本转语音,返回音频字节(mp3)。"""
    api_key, base_url, model = _client_config()
    s = get_settings()
    resp = httpx.post(
        base_url.rstrip("/") + "/audio/speech",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "model": model,
            "input": text,
            "voice": voice or s.tts_voice or "alloy",
            "response_format": "mp3",
        },
        timeout=TTS_TIMEOUT_SECONDS,
    )
    resp.raise_for_status()
    return resp.content
