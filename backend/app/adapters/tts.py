"""TTS 适配层:CosyVoice(阿里云百炼 Model Studio)语音合成,统一走 dashscope SDK。

铁律:所有 AI 模型访问只经 adapters。

CosyVoice 官方 Python SDK(参考 https://help.aliyun.com/zh/model-studio/cosyvoice-tts-python-sdk):
    dashscope.base_http_api_url = 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1'
    result = HttpSpeechSynthesizer.call(model=..., text=..., voice=..., format='mp3', stream=False, api_key=...)
    result.audio_url  # 非流式返回音频下载 URL

配置字段来自 `app.core.config.Settings`:
    tts_api_key / tts_base_url / tts_model / tts_voice
(TTS_API_KEY / TTS_BASE_URL / TTS_MODEL / TTS_VOICE)

TTS_BASE_URL 若为百炼 compatible-mode 地址(含 `/compatible-mode/v1`),
自动派生 SDK 需要的 `/api/v1` 专属域名地址(同一 WorkspaceId)。
"""

import httpx

import dashscope
from dashscope.audio.http_tts.http_speech_synthesizer import HttpSpeechSynthesizer

from app.core.config import get_settings

TTS_TIMEOUT_SECONDS = 60


def _client_config():
    s = get_settings()
    if not s.tts_api_key:
        raise RuntimeError("TTS 未配置:请设置环境变量 TTS_API_KEY")
    if not s.tts_base_url:
        raise RuntimeError("TTS 未配置:请设置环境变量 TTS_BASE_URL")
    if not s.tts_model:
        raise RuntimeError("TTS 未配置:请设置环境变量 TTS_MODEL")
    return s


def _sdk_base_url(base_url: str) -> str:
    """百炼 compatible-mode 地址 → SDK 需要的 `/api/v1` 专属域名地址。"""
    if "/compatible-mode/v1" in base_url:
        return base_url.split("/compatible-mode/v1")[0] + "/api/v1"
    return base_url.rstrip("/")


def synthesize(text: str, *, voice: str | None = None) -> bytes:
    """文本转语音(CosyVoice 非流式),下载并返回音频字节(mp3)。

    Raises:
        RuntimeError: 配置缺失 / 合成失败(非 200 / 无 audio_url)。
    """
    s = _client_config()
    dashscope.base_http_api_url = _sdk_base_url(s.tts_base_url)

    result = HttpSpeechSynthesizer.call(
        model=s.tts_model,
        text=text,
        voice=voice or s.tts_voice or "Cherry",
        format="mp3",
        stream=False,
        api_key=s.tts_api_key,
    )

    if result is None:
        raise RuntimeError("CosyVoice 返回为空")

    # dashscope SDK 成功时 status_code == 0;出错时非 0 且无 audio_url
    status = getattr(result, "status_code", 0)
    audio_url = getattr(result, "audio_url", None)
    if status != 0 and not audio_url:
        msg = getattr(result, "message", None) or f"状态码 {status}"
        raise RuntimeError(f"CosyVoice 合成失败: {msg}")
    if not audio_url:
        raise RuntimeError("CosyVoice 未返回音频 URL")

    resp = httpx.get(audio_url, timeout=TTS_TIMEOUT_SECONDS)
    resp.raise_for_status()
    return resp.content
