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
from app.services.api_config import ResolvedService, record_usage, resolve_service

TTS_TIMEOUT_SECONDS = 60


def _client_config():
    config = resolve_service("tts")
    if not config.enabled:
        raise RuntimeError("TTS 服务已停用")
    if not config.api_key:
        raise RuntimeError("TTS 未配置:请设置环境变量 TTS_API_KEY")
    if not config.base_url:
        raise RuntimeError("TTS 未配置:请设置环境变量 TTS_BASE_URL")
    if not config.model:
        raise RuntimeError("TTS 未配置:请设置环境变量 TTS_MODEL")
    return config


def _sdk_base_url(base_url: str) -> str:
    """百炼 compatible-mode 地址 → SDK 需要的 `/api/v1` 专属域名地址。"""
    if "/compatible-mode/v1" in base_url:
        return base_url.split("/compatible-mode/v1")[0] + "/api/v1"
    return base_url.rstrip("/")


def synthesize(text: str, *, voice: str | None = None) -> bytes:
    """文本转语音(CosyVoice 非流式),下载并返回音频字节(mp3)。"""
    return synthesize_with_url(text, voice=voice)["audio"]


def synthesize_with_url(text: str, *, voice: str | None = None) -> dict:
    """文本转语音,返回音频字节与供应商原始 audio_url。

    Raises:
        RuntimeError: 配置缺失 / 合成失败(非 200 / 无 audio_url)。
    """
    primary = _client_config()
    configs = [primary] + ([primary.fallback] if primary.fallback else [])
    last_error: Exception | None = None
    for config in configs:
        if not config or not config.enabled or not config.api_key or not config.base_url or not config.model:
            continue
        try:
            return _synthesize_with_config(config, text, voice)
        except Exception as exc:  # noqa: BLE001 - 主服务失败时仅尝试一次备用服务
            last_error = exc
            record_usage(primary.service_id, failed=True)
    if last_error:
        raise last_error
    raise RuntimeError("TTS 未配置:请设置环境变量 TTS_API_KEY")


def _synthesize_with_config(config: ResolvedService, text: str, voice: str | None) -> dict:
    dashscope.base_http_api_url = _sdk_base_url(config.base_url)
    settings = get_settings()
    result = HttpSpeechSynthesizer.call(
        model=config.model,
        text=text,
        voice=voice or settings.tts_voice or "longanhuan_v3.6",
        format="mp3",
        stream=False,
        api_key=config.api_key,
    )

    if result is None:
        raise RuntimeError("CosyVoice 返回为空")

    status = getattr(result, "status_code", 0)
    audio_url = getattr(result, "audio_url", None)
    if status != 0 and not audio_url:
        msg = getattr(result, "message", None) or f"状态码 {status}"
        raise RuntimeError(f"CosyVoice 合成失败: {msg}")
    if not audio_url:
        raise RuntimeError("CosyVoice 未返回音频 URL")

    resp = httpx.get(audio_url, timeout=TTS_TIMEOUT_SECONDS, trust_env=False)
    resp.raise_for_status()
    record_usage("tts")
    return {"audio": resp.content, "url": audio_url}
