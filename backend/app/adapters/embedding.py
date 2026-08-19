"""Embedding 适配层:所有文本向量化调用只经此模块,禁止直连具体供应商。

调用 OpenAI 兼容接口:
    POST {base_url}/embeddings
    Authorization: Bearer {api_key}
    {"model": ..., "input": [text, ...]}
"""

import httpx

from app.core.config import get_settings as _get_settings
from app.services.api_config import record_usage, resolve_service

EMBEDDING_TIMEOUT_SECONDS = 60
# 保留模块级配置依赖，供单元测试和嵌入式部署显式注入。
get_settings = _get_settings


def _configured_service():
    """获取管理员配置；显式注入设置时只使用该设置，避免被持久化配置覆盖。"""
    if get_settings is not _get_settings:
        settings = get_settings()
        from app.services.api_config import ResolvedService

        return ResolvedService(
            "embedding",
            "向量模型",
            True,
            settings.embedding_api_key,
            settings.embedding_base_url,
            settings.embedding_model,
        )
    return resolve_service("embedding")


def embed(texts: list[str]) -> list[list[float]]:
    """批量文本 → 向量,顺序与入参一致。

    Raises:
        RuntimeError: API key / base_url / model 未配置时,给出清晰错误提示。
        httpx.HTTPError: 上游请求失败(由调用方决定是否降级处理)。
    """
    primary = _configured_service()
    if not primary.api_key:
        raise RuntimeError("Embedding 未配置:请设置环境变量 EMBEDDING_API_KEY")
    if not primary.base_url:
        raise RuntimeError("Embedding 未配置:请设置环境变量 EMBEDDING_BASE_URL")
    if not primary.model:
        raise RuntimeError("Embedding 未配置:请设置环境变量 EMBEDDING_MODEL")

    configs = [primary] + ([primary.fallback] if primary.fallback else [])
    last_error: Exception | None = None
    for config in configs:
        if not config or not config.enabled or not config.api_key or not config.base_url or not config.model:
            continue
        try:
            resp = httpx.post(
                config.base_url.rstrip("/") + "/embeddings",
                headers={"Authorization": f"Bearer {config.api_key}"},
                json={"model": config.model, "input": texts},
                timeout=config.timeout_seconds or EMBEDDING_TIMEOUT_SECONDS,
                trust_env=False,
            )
            resp.raise_for_status()
            data = resp.json()
            usage = data.get("usage") or {}
            record_usage(primary.service_id, prompt_tokens=int(usage.get("prompt_tokens") or 0))
            return [item["embedding"] for item in data.get("data", [])]
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            record_usage(primary.service_id, failed=True)
    if last_error:
        raise last_error
    raise RuntimeError("Embedding 未配置:请设置环境变量 EMBEDDING_API_KEY")
