"""从已结束会话提取长期记忆候选；模型只提出候选，服务层负责安全审核与落库。"""

from __future__ import annotations

import json
import re

import httpx

from app.adapters import llm
from app.services.api_config import record_usage, resolve_service


SYSTEM_PROMPT = """你是 MindHarbor 的长期记忆候选提取器。
只从用户明确表达、且未来对陪伴有帮助的稳定信息中提取候选，不做性格或心理诊断，不把一次性情绪当成记忆。
忽略自伤、自杀、危机、医疗诊断、密码、API 密钥、身份证号和第三方隐私。
只输出 JSON：{"candidates":[{"memory_type":"fact|preference|project|context|boundary","content":"不超过120字的第三人称事实","evidence":"不超过60字的原文依据","confidence":0到1的小数,"expires_at":null或ISO日期}]}
没有充分证据时返回空数组，最多返回 5 条。"""

MANUAL_CLASSIFICATION_PROMPT = """你是 MindHarbor 的个性化配置分类器。
根据用户亲自输入的单条配置，将其归入且只归入以下一个类型：
- fact：基本信息
- preference：交流偏好
- project：项目与任务
- context：持续背景
- boundary：交流边界
不作心理诊断，不补充用户没有说过的内容。只输出 JSON：{"memory_type":"上述类型之一"}。"""

MEMORY_TYPES = {"fact", "preference", "project", "context", "boundary"}


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


def _profile_service_configured() -> bool:
    service = resolve_service("profile_analysis")
    return bool(service.enabled and service.api_key and service.base_url and service.model)


def _complete_with_profile_service(system_prompt: str, user_content: str, *, temperature: float) -> dict:
    """Use the managed profile service so configuration, fallback, and usage stay aligned."""
    primary = resolve_service("profile_analysis")
    services = [primary] + ([primary.fallback] if primary.fallback else [])
    last_error: Exception | None = None
    for service in services:
        if not service or not service.enabled or not service.api_key or not service.base_url or not service.model:
            continue
        try:
            response = httpx.post(
                service.base_url.rstrip("/") + "/chat/completions",
                headers={"Authorization": f"Bearer {service.api_key}", "Content-Type": "application/json"},
                json={
                    "model": service.model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_content[:12000]},
                    ],
                    "temperature": temperature,
                    "stream": False,
                    "response_format": {"type": "json_object"},
                },
                timeout=service.timeout_seconds,
                trust_env=False,
            )
            response.raise_for_status()
            data = response.json()
            choices = data.get("choices") or []
            if not choices:
                raise RuntimeError("记忆提取服务返回为空")
            parsed = _extract_json((choices[0].get("message") or {}).get("content") or "")
            if not isinstance(parsed, dict):
                raise ValueError("记忆提取服务返回的 JSON 无效")
            usage = data.get("usage") or {}
            record_usage(
                primary.service_id,
                prompt_tokens=int(usage.get("prompt_tokens") or 0),
                completion_tokens=int(usage.get("completion_tokens") or 0),
            )
            return parsed
        except Exception as exc:  # noqa: BLE001 - 主服务失败时尝试管理员配置的备用服务
            last_error = exc
    if last_error is not None:
        record_usage(primary.service_id, failed=True)
        raise last_error
    raise RuntimeError("人物画像分析服务未配置")


def _fallback_memory_type(content: str) -> str:
    """模型暂不可用时保留可预期的中文规则分类。"""
    lowered = content.lower()
    if any(marker in lowered for marker in ("不要", "别", "避免", "禁止", "不希望", "请勿")):
        return "boundary"
    if any(marker in lowered for marker in ("希望", "偏好", "喜欢", "先", "语气", "简洁", "温和")):
        return "preference"
    if any(marker in lowered for marker in ("目标", "计划", "打算", "准备", "想要", "完成", "改善")):
        return "context"
    if any(marker in lowered for marker in ("项目", "论文", "课程", "比赛", "实习", "任务")):
        return "project"
    if any(marker in lowered for marker in ("最近", "目前", "现在", "一直", "正在", "家庭", "学校", "工作")):
        return "context"
    return "fact"


def classify_manual_memory(content: str) -> str:
    """由模型分类用户手动配置；任何上游失败都安全降级为规则分类。"""
    fallback = _fallback_memory_type(content)
    try:
        if _profile_service_configured():
            parsed = _complete_with_profile_service(
                MANUAL_CLASSIFICATION_PROMPT,
                content[:1000],
                temperature=0,
            )
        else:
            parsed = llm.complete_json(MANUAL_CLASSIFICATION_PROMPT, content[:1000], temperature=0)
        value = str((parsed or {}).get("memory_type") or "").strip().lower()
        return value if value in MEMORY_TYPES else fallback
    except Exception:  # noqa: BLE001 - 分类不能阻塞用户编辑自己的配置
        return fallback


def extract_candidates(transcript: str, existing_memories: list[str] | None = None) -> dict:
    """调用 Qwen/兼容接口；未配置独立服务时复用主 LLM 配置。"""

    context = ""
    if existing_memories:
        context = "\n已有记忆（只用于去重，不要照抄无证据内容）：\n" + "\n".join(existing_memories[:20])
    user_content = (transcript[:12000] + context).strip()
    if _profile_service_configured():
        parsed = _complete_with_profile_service(SYSTEM_PROMPT, user_content, temperature=0.1)
    else:
        parsed = llm.complete_json(SYSTEM_PROMPT, user_content, temperature=0.1)
    if not isinstance(parsed, dict) or not isinstance(parsed.get("candidates"), list):
        raise ValueError("记忆提取服务返回的 JSON 无效")
    return parsed
