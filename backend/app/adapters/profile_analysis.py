"""Qwen 画像分析适配器，使用 OpenAI 兼容 Chat Completions 协议。"""

from __future__ import annotations

import json
import re

import httpx

from app.core.config import get_settings


SYSTEM_PROMPT = """你是心理陪伴产品的用户画像分析器，不做心理诊断，不判断疾病或风险。
只根据用户消息中的稳定、可重复的行为偏好生成 JSON。忽略危机、自伤、自杀、随手画、练习和一次性情绪宣泄。
输出格式：{"observations":[{"trait_key":"openness|conscientiousness|extraversion|agreeableness|emotional_sensitivity","direction":"increase|decrease","strength":0到1之间的小数,"evidence":"不超过40字"}],"overall_note":"不超过100字"}。
没有充分证据时 observations 输出空数组。最多输出 3 条，不要输出 JSON 之外的内容。"""


def _extract_json(text: str) -> dict | None:
    cleaned = re.sub(r"^```[a-zA-Z]*\s*|\s*```$", "", text or "").strip()
    try:
        value = json.loads(cleaned)
        return value if isinstance(value, dict) else None
    except json.JSONDecodeError:
        start, end = cleaned.find("{"), cleaned.rfind("}")
        if start < 0 or end <= start:
            return None
        try:
            value = json.loads(cleaned[start : end + 1])
            return value if isinstance(value, dict) else None
        except json.JSONDecodeError:
            return None


def analyze_transcript(transcript: str) -> dict:
    settings = get_settings()
    if not settings.profile_analysis_api_key or not settings.profile_analysis_base_url:
        raise RuntimeError("画像分析服务未配置")
    payload = {
        "model": settings.profile_analysis_model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": transcript[:12000]},
        ],
        "temperature": 0.1,
        "stream": False,
        "response_format": {"type": "json_object"},
    }
    response = httpx.post(
        settings.profile_analysis_base_url.rstrip("/") + "/chat/completions",
        headers={"Authorization": f"Bearer {settings.profile_analysis_api_key}", "Content-Type": "application/json"},
        json=payload,
        timeout=settings.profile_analysis_timeout_seconds,
        trust_env=False,
    )
    response.raise_for_status()
    data = response.json()
    choices = data.get("choices") or []
    if not choices:
        raise RuntimeError("画像分析服务返回为空")
    content = (choices[0].get("message") or {}).get("content") or ""
    parsed = _extract_json(content)
    if not parsed or not isinstance(parsed.get("observations", []), list):
        raise ValueError("画像分析服务返回的 JSON 无效")
    return parsed
