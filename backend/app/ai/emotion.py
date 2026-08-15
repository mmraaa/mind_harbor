"""情绪识别 + 风险筛查。

风险筛查 = 危机关键词库(快速通道,不调 LLM)+ LLM 判定(结构化输出 is_risk);
任一通道命中 → 返回风险模板并标记会话 risk_level=high(由对话控制器执行)。

情绪类别固定枚举 EMOTION_CATEGORIES(铁律)来自 `app/models/emotion.py`,非法类别回落 calm。
"""

from dataclasses import dataclass

from app.adapters import llm
from app.models.emotion import EMOTION_CATEGORIES

# 危机关键词库:自伤 / 自杀类关键词,命中即高风险(快速通道)
RISK_KEYWORDS = [
    "自杀", "自残", "轻生", "想死", "不想活", "活不下去", "结束生命",
    "伤害自己", "割腕", "跳楼", "离开这个世界", "解脱",
]

# 风险回复模板(设计文档附录 B):温和 + 危机热线 + 校园求助渠道
RISK_REPLY_TEMPLATE = (
    "我注意到你现在可能很难受。请先做几个深呼吸——你并不孤单,有很多方式可以帮你度过这一刻。\n"
    "建议你尽快联系身边的支持力量:危机干预热线 **400-161-9995**,或校内心理咨询中心(工作时间可直接预约)。\n"
    "如果你有伤害自己的想法,请务必立刻联系以上渠道,也可以直接告诉我,我陪着你,但专业帮助更重要。"
)

EMOTION_SYSTEM_PROMPT = (
    "你是 MindHarbor 的情绪识别引擎。请识别用户消息中的情绪并输出 JSON,"
    f"category 必须是以下之一:{EMOTION_CATEGORIES};"
    "intensity 为 1-10 的整数;stress_source 为压力来源(中文,无则空串);"
    "support_need 为用户需要的支持(中文,无则空串);"
    "is_risk 为布尔,表示消息是否含自伤/自杀等危机信号;risk_reason 为风险原因(无风险则为空串)。"
    "只输出 JSON 对象。"
)


@dataclass
class EmotionResult:
    """情绪识别结果;is_risk=True 时对话控制器须触发风险模板并标记会话 risk_level=high。"""

    category: str = "calm"
    intensity: int = 1
    stress_source: str | None = None
    support_need: str | None = None
    is_risk: bool = False
    risk_reason: str | None = None


def _clamp_int(value, lo: int = 1, hi: int = 10, default: int = 1) -> int:
    try:
        return max(lo, min(hi, int(value)))
    except (TypeError, ValueError):
        return default


def _short(value, limit: int = 200) -> str | None:
    """短文本清洗:空 → None;超长截断(列 String(256))。"""
    if not value:
        return None
    value = str(value).strip()
    return value if len(value) <= limit else value[:limit]


def analyze(text: str) -> EmotionResult:
    """情绪识别 + 风险筛查:关键词快速通道 → LLM 结构化判定。

    LLM 输出逐字段校验并兜底:非法类别回落 calm、intensity 收敛到 1-10、
    is_risk 为真时携带 risk_reason。
    """
    hit = next((k for k in RISK_KEYWORDS if k in text), None)
    if hit:
        return EmotionResult(
            category="sad",
            intensity=8,
            stress_source="危机信号",
            support_need="紧急支持",
            is_risk=True,
            risk_reason=f"命中危机关键词「{hit}」",
        )

    data = llm.complete_json(EMOTION_SYSTEM_PROMPT, text)

    category = data.get("category") or "calm"
    if category not in EMOTION_CATEGORIES:
        category = "calm"

    is_risk = bool(data.get("is_risk")) or bool(data.get("risk_flags"))
    reason = data.get("risk_reason") or data.get("risk_reasoning") or ""
    return EmotionResult(
        category=category,
        intensity=_clamp_int(data.get("intensity", 1)),
        stress_source=_short(data.get("stress_source")),
        support_need=_short(data.get("support_need")),
        is_risk=is_risk,
        risk_reason=reason or None,
    )
