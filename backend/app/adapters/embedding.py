"""Embedding 适配层:所有文本向量化调用只经此模块,禁止直连具体供应商。

调用 OpenAI 兼容接口:
    POST {base_url}/embeddings
    Authorization: Bearer {api_key}
    {"model": ..., "input": [text, ...]}
"""

import httpx

from app.core.config import get_settings

EMBEDDING_TIMEOUT_SECONDS = 60


def embed(texts: list[str]) -> list[list[float]]:
    """批量文本 → 向量,顺序与入参一致。

    Raises:
        RuntimeError: API key / base_url / model 未配置时,给出清晰错误提示。
        httpx.HTTPError: 上游请求失败(由调用方决定是否降级处理)。
    """
    s = get_settings()
    if not s.embedding_api_key:
        raise RuntimeError("Embedding 未配置:请设置环境变量 EMBEDDING_API_KEY")
    if not s.embedding_base_url:
        raise RuntimeError("Embedding 未配置:请设置环境变量 EMBEDDING_BASE_URL")
    if not s.embedding_model:
        raise RuntimeError("Embedding 未配置:请设置环境变量 EMBEDDING_MODEL")

    url = s.embedding_base_url.rstrip("/") + "/embeddings"
    payload = {"model": s.embedding_model, "input": texts}
    resp = httpx.post(
        url,
        headers={"Authorization": f"Bearer {s.embedding_api_key}"},
        json=payload,
        timeout=EMBEDDING_TIMEOUT_SECONDS,
    )
    resp.raise_for_status()
    data = resp.json()
    return [item["embedding"] for item in data.get("data", [])]
