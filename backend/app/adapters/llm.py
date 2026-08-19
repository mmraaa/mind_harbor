"""LLM 适配层:所有大模型调用只经此模块,禁止直连具体供应商。

OpenAI 兼容 chat completions 协议:
    POST {base_url}/chat/completions
    Authorization: Bearer {api_key}
    {"model": ..., "messages": [...], "stream": ...}

提供:
- `stream_chat`:流式生成(对话 SSE 增量,OpenAI SSE 协议);
- `complete_json`:结构化 JSON 输出(情绪识别 / 日记生成),解析失败自动兜底重试;
- `complete_text`:一次性整段文本(记忆摘要等)。

配置字段来自 `app.core.config.Settings`:`llm_api_key` / `llm_base_url` / `llm_model`
(环境变量 `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL`);key 缺失抛清晰 RuntimeError。
"""

import json
import re
from typing import Iterator

import httpx

from app.services.api_config import record_usage, resolve_service

LLM_TIMEOUT_SECONDS = 120
_JSON_ONLY_SYSTEM = "请只输出 JSON 对象本身,不要输出任何解释、前言或 markdown 代码围栏。"


def _client_config() -> tuple[str, str, str]:
    """校验配置并返回 (api_key, base_url, model);缺失抛清晰错误。"""
    config = resolve_service("llm")
    if not config.api_key:
        raise RuntimeError("LLM 未配置:请设置环境变量 LLM_API_KEY")
    if not config.base_url:
        raise RuntimeError("LLM 未配置:请设置环境变量 LLM_BASE_URL")
    if not config.model:
        raise RuntimeError("LLM 未配置:请设置环境变量 LLM_MODEL")
    return config.api_key, config.base_url, config.model


def _chat_url(base_url: str) -> str:
    return base_url.rstrip("/") + "/chat/completions"


def _headers(api_key: str) -> dict:
    return {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}


def _limit_stream_context(
    messages: list[dict], context_window: int | None, output_tokens: int | None
) -> list[dict]:
    """按配置窗口压缩流式对话输入，优先保留系统规则和最新用户内容。

    没有供应商专属 tokenizer 时，按保守字符上限估算，避免历史内容无限增长。
    """
    if not context_window:
        return messages
    char_limit = max(256, (context_window - (output_tokens or 0)) * 2)
    system_budget = min(max(128, char_limit // 3), char_limit)
    result = [dict(message) for message in messages]
    remaining = char_limit

    for message in result:
        if message.get("role") != "system" or not isinstance(message.get("content"), str):
            continue
        content = message["content"]
        kept = content[:system_budget]
        message["content"] = kept
        remaining -= len(kept)

    for message in reversed(result):
        if message.get("role") == "system" or not isinstance(message.get("content"), str):
            continue
        content = message["content"]
        kept = content[-max(0, remaining):] if remaining else ""
        message["content"] = kept
        remaining -= len(kept)
    return result


def _prepare_payload(payload: dict, config) -> dict:
    prepared = dict(payload)
    prepared["model"] = config.model
    if isinstance(prepared.get("messages"), list):
        prepared["messages"] = _limit_stream_context(
            prepared["messages"], config.context_window, config.max_tokens
        )
    if not prepared.get("max_tokens") and config.max_tokens:
        prepared["max_tokens"] = config.max_tokens
    return prepared


def _chat_completion(payload: dict) -> str:
    """非流式 chat completions 请求,返回首条 message.content(已 strip)。"""
    message = _chat_completion_message(payload)
    return (message.get("content") or "").strip()


def _chat_completion_message(payload: dict) -> dict:
    """非流式 chat completions 请求,返回首条完整 message dict(content/tool_calls)。"""
    primary = resolve_service("llm")
    configs = [primary] + ([primary.fallback] if primary.fallback else [])
    last_error: Exception | None = None
    for config in configs:
        if not config or not config.enabled or not config.api_key or not config.base_url or not config.model:
            continue
        request_payload = _prepare_payload(payload, config)
        try:
            resp = httpx.post(
                _chat_url(config.base_url),
                headers=_headers(config.api_key),
                json=request_payload,
                timeout=config.timeout_seconds or LLM_TIMEOUT_SECONDS,
                trust_env=False,
            )
            resp.raise_for_status()
            data = resp.json()
            choices = data.get("choices") or []
            if not choices:
                raise RuntimeError("LLM 返回为空(no choices)")
            usage = data.get("usage") or {}
            record_usage(
                primary.service_id,
                prompt_tokens=int(usage.get("prompt_tokens") or 0),
                completion_tokens=int(usage.get("completion_tokens") or 0),
            )
            return choices[0].get("message") or {}
        except Exception as exc:  # noqa: BLE001 - 主服务失败时尝试一次备用服务
            last_error = exc
            record_usage(primary.service_id, failed=True)
    if last_error:
        raise last_error
    raise RuntimeError("LLM 未配置:请设置环境变量 LLM_API_KEY")


def _extract_json(text: str) -> dict | None:
    """从 LLM 输出中稳健提取 JSON 对象:去代码围栏 → 直接解析 → 找首个平衡 {} 块。"""
    if not text:
        return None
    cleaned = re.sub(r"^```[a-zA-Z]*\s*", "", text)
    cleaned = re.sub(r"\s*```$", "", cleaned).strip()
    try:
        obj = json.loads(cleaned)
        return obj if isinstance(obj, dict) else None
    except json.JSONDecodeError:
        pass

    start = cleaned.find("{")
    if start == -1:
        return None
    depth = 0
    in_str = False
    escaped = False
    for i in range(start, len(cleaned)):
        ch = cleaned[i]
        if in_str:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                try:
                    obj = json.loads(cleaned[start : i + 1])
                    return obj if isinstance(obj, dict) else None
                except json.JSONDecodeError:
                    return None
    return None


def stream_chat(
    messages: list[dict],
    *,
    temperature: float = 0.7,
    max_tokens: int | None = None,
) -> Iterator[str]:
    """流式对话生成,逐增量 yield 文本片段(OpenAI SSE 协议)。

    Raises:
        RuntimeError: 配置缺失 / 上游返回非 2xx / 流为空。
    """
    primary = resolve_service("llm")
    requested_output_tokens = max_tokens or primary.max_tokens
    payload: dict = {
        "model": primary.model,
        "messages": _limit_stream_context(messages, primary.context_window, requested_output_tokens),
        "stream": True,
        "temperature": temperature,
    }
    if requested_output_tokens:
        payload["max_tokens"] = requested_output_tokens

    configs = [primary] + ([primary.fallback] if primary.fallback else [])
    last_error: Exception | None = None
    for config in configs:
        if not config or not config.enabled or not config.api_key or not config.base_url or not config.model:
            continue
        request_payload = _prepare_payload(payload, config)
        prompt_tokens = 0
        completion_tokens = 0
        try:
            with httpx.stream(
                "POST",
                _chat_url(config.base_url),
                headers=_headers(config.api_key),
                json=request_payload,
                timeout=httpx.Timeout(config.timeout_seconds or LLM_TIMEOUT_SECONDS, read=300.0),
                trust_env=False,
            ) as resp:
                resp.raise_for_status()
                for line in resp.iter_lines():
                    if not line or not line.startswith("data:"):
                        continue
                    data = line[len("data:"):].strip()
                    if data == "[DONE]":
                        break
                    chunk = json.loads(data)
                    usage = chunk.get("usage") or {}
                    prompt_tokens = int(usage.get("prompt_tokens") or prompt_tokens)
                    completion_tokens = int(usage.get("completion_tokens") or completion_tokens)
                    choices = chunk.get("choices") or []
                    if not choices:
                        continue
                    delta = (choices[0].get("delta") or {}).get("content")
                    if delta:
                        yield delta
            record_usage(
                primary.service_id,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
            )
            return
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            record_usage(primary.service_id, failed=True)
    if last_error:
        raise last_error
    raise RuntimeError("LLM 未配置:请设置环境变量 LLM_API_KEY")


def chat_with_tools(
    messages: list[dict],
    tools: list[dict],
    *,
    temperature: float = 0.1,
) -> tuple[str, list[dict]]:
    """非流式 function-calling 调用:LLM 决定是回复文本还是调用工具。

    Returns:
        (content, tool_calls):content 为回复文本(可能为空串);
        tool_calls 为工具调用列表(每项含 id/function.name/function.arguments)。
    """
    payload: dict = {
        "model": _client_config()[2],
        "messages": messages,
        "tools": tools,
        "stream": False,
        "temperature": temperature,
    }
    message = _chat_completion_message(payload)
    return (message.get("content") or "").strip(), message.get("tool_calls") or []


def complete_text(
    system: str,
    user: str,
    *,
    temperature: float = 0.3,
    max_tokens: int | None = None,
) -> str:
    """一次性文本生成(记忆摘要等),返回去除首尾空白后的整段文本。"""
    payload: dict = {
        "model": _client_config()[2],
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "stream": False,
        "temperature": temperature,
    }
    if max_tokens:
        payload["max_tokens"] = max_tokens
    return _chat_completion(payload)


def complete_json(system: str, user: str, *, temperature: float = 0.2) -> dict:
    """结构化 JSON 输出:response_format json_object + schema 提示词。

    解析失败兜底:重试一次(追加"只输出 JSON"指令);仍失败抛 RuntimeError。
    """
    payload: dict = {
        "model": _client_config()[2],
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "stream": False,
        "temperature": temperature,
        "response_format": {"type": "json_object"},
    }

    parsed = _extract_json(_chat_completion(payload))
    if parsed is not None:
        return parsed

    # 兜底:重试一次,只要求 JSON 对象
    retry = dict(payload)
    retry["messages"] = [
        {"role": "system", "content": system + "\n" + _JSON_ONLY_SYSTEM},
        {"role": "user", "content": user},
    ]
    parsed = _extract_json(_chat_completion(retry))
    if parsed is not None:
        return parsed
    raise RuntimeError("LLM 结构化输出解析失败(已自动重试),请稍后重试")
