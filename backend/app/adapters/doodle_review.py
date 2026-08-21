"""DashScope 多模态随手画事实观察与心理陪伴适配器。

事实提取、风险分级、知识检索和陪伴回应分阶段完成；适配器不做心理诊断。
服务配置由管理员 API 配置表解析，主服务失败时按已配置的备用服务重试一次。
"""

from __future__ import annotations

import asyncio
import base64
import inspect
import json
import re
from dataclasses import dataclass
from dataclasses import field
from pathlib import Path
from typing import Any, Callable
from uuid import uuid4

import httpx
from sqlalchemy.orm import Session

from app.services.api_config import ResolvedService, record_usage, resolve_service

FACTS_PROMPT = (
    "只输出JSON，提取图中可见事实；不得做心理判断。"
    "字段：visualNarrative,detectedTexts,visualElements。"
    "先仔细识别画面中的手写文字，尤其是居中、较大的单个汉字；detectedTexts只填写清楚可见的原始文字，"
    "逐字保留，不要改写成近义词或按语义猜测。"
    "visualNarrative描述颜色、线条、形状和构图；数组字段必须是字符串数组。"
    "文字不清楚时返回空数组，不要猜测文字，不要输出 Markdown。"
)
OBSERVATION_PROMPT = FACTS_PROMPT

SUPPORT_PROMPT = (
    "只输出JSON，字段为supportiveResponse,suggestedQuestion。"
    "你是温和的心理陪伴助手，不是心理医生，不做诊断或确定性风险判断。"
    "supportiveResponse必须是一段完整、连贯、自然的中文回应，约80到320字，结尾必须完整。"
    "必须围绕detectedTexts中实际识别到的每个文字回答：先说出该字或词，再解释它可能带来的含义或情绪联想，"
    "然后给出与该字或词相符的温和生命教育、情绪教育或安全建议。不要用一套通用模板替代不同文字。"
    "不要使用“我注意到”“我看见”或“我看到”开场，直接从识别到的字或词的含义开始。"
    "严格遵循wordSpecificGuidance；看到一个字不等于用户具有对应意图。"
    "回应必须按以下顺序组织：先承接和安慰，再解释实际文字可能表达的含义，明确文字不等于意图，"
    "然后给一个具体可执行的小步骤，最后邀请用户继续表达；不要训斥或责怪。"
    "当riskLevel为concern时，温和说明文字看起来沉重，邀请用户说明它的含义，并提供倾听、呼吸或联系可信任之人的选择。"
    "当detectedTexts包含自杀、自残、不想活或结束自己时，必须直接表达‘谢谢你愿意说出来’或‘你不必一个人承受’，"
    "并询问‘你现在安全吗’，同时询问是否正在伤害自己、是否有具体计划或已经准备好的危险物品；不能只给泛化安慰。"
    "当riskLevel为urgent时，优先建议远离危险物品、不要独处、联系身边可信任的人和当地紧急服务。"
    "只能使用提供的知识库引用，不要编造来源；不要输出 Markdown、列表、思维过程或心理诊断。"
)
# 事实提取需要短输出；陪伴阶段包含 RAG 上下文，并需要留出完整回应的空间。
FACTS_MAX_TOKENS = 1200
SUPPORT_MAX_TOKENS = 4096
# 旧测试/集成代码使用的名称，保留别名以兼容团队分支。
DOODLE_SUPPORT_PROMPT = SUPPORT_PROMPT

_FORBIDDEN = re.compile(r"(人格|危险程度|创伤经历|心理疾病|精神疾病|表明你.{0,8}(抑郁|焦虑|危险))")
_URGENT = re.compile(r"(?:我|自己|本人|他|她|别人).{0,10}(?:要|想|准备|正在|已经|今晚|现在).{0,12}(?:自杀|自残|杀人|伤害|砍|捅)|(?:自杀|自残|杀人|伤害).{0,10}(?:计划|方法|工具|今晚|现在|马上)")
_CONCERN_TERMS = ("杀", "死", "自杀", "自残", "伤害", "结束自己", "不想活", "毁灭")
_KNOWN_WORD_PHRASES = (
    "结束生命", "结束自己", "不想活", "自杀", "自残", "杀人", "伤害", "死亡", "去世", "离世",
)
_SELF_HARM_TERMS = ("自杀", "结束自己", "不想活")
_CRISIS_KNOWLEDGE_PATH = (
    Path(__file__).resolve().parents[2] / "data" / "knowledge" / "随手画危机支持与生命教育.md"
)

# 这些说明只基于识别到的文字，不把一个字当作用户的意图或诊断。它们既约束
# 模型回应，也在模型再次输出通用模板时提供最小、可预测的教育性补充。
_WORD_GUIDANCE = (
    (
        ("自杀", "结束自己", "不想活"),
        "这个词很沉重，谢谢你愿意把它说出来；看到这些文字不等于你已经决定行动，也不必一个人承受。"
        "必须先温和询问‘你现在安全吗’，以及是否有正在伤害自己、具体计划或已经准备好的危险物品。"
        "若有明确计划、正在实施或无法确保安全，优先建议远离危险物品、不要独处，联系身边可信任的人和当地紧急服务。",
        "“自杀”这个词很沉重，谢谢你愿意把它写出来。痛苦把人逼到只看见一种出口时，感受是真实的，但你不需要独自做决定，也不必一个人承受。请先告诉我：你现在安全吗？此刻有没有正在伤害自己、具体计划，或已经准备好的危险物品？如果有立即危险，请先把危险物品放远、不要独处，马上联系身边可信任的人、学校心理中心或当地紧急服务；如果暂时安全，也可以只告诉我最近最难受的那一件事，我们先一起把这一刻撑过去。",
        ("安全", "计划", "不要独处", "危险物品", "可信任的人"),
    ),
    (
        ("自残", "自伤", "割腕"),
        "先说明看到这些文字不等于用户会伤害自己；承认身体或情绪疼痛可能需要被看见。"
        "邀请用户暂时远离可能造成伤害的物品，并把感受告诉可信任的人或专业支持。",
        "这些文字可能让人联想到伤害自己或难以承受的疼痛，但它们不等于你会这样做。先让自己远离可能造成伤害的物品，把此刻的感受告诉一位可信任的人；当你觉得难以保证安全时，请尽快联系当地紧急服务。",
        ("伤害", "安全", "可信任的人"),
    ),
    (
        ("死亡", "去世", "离世", "死"),
        "围绕死亡、生命的终结、离别、未知或恐惧开展温和的生命教育。"
        "说明谈到死亡不等于想放弃生活；可以解释生命过程会终止，但人的影响、关系与记忆仍可能延续，"
        "再帮助用户把注意力带回当下的关系、仍能选择的照顾和可获得的支持。"
        "不要作关于死后世界或“死亡不是终点”的绝对化承诺。",
        "“死”这个字常会让人想到死亡、生命的终结或离别。谈到死亡并不等于想放弃生活；生命过程会终止，但人的影响、关系与记忆仍可能延续，我们也可以把注意力带回当下仍能照顾自己的部分和可以获得的支持。",
        ("死亡", "生命", "终结", "离别", "记忆"),
    ),
    (
        ("杀", "杀人", "砍", "捅", "伤害他人"),
        "先说明看到这些字不等于用户想伤害他人；区分文字、情绪和行动。"
        "若用户感到强烈愤怒或担心会失控，建议先拉开与人和危险物品的距离，并联系可信任的人或紧急服务。",
        "“杀”这个字可能让人联想到愤怒、冲突或伤害，但写下它不等于你想伤害任何人。若此刻情绪很冲或担心自己会失控，先和人、危险物品拉开一点距离，再联系一位可信任的人一起把这阵情绪安顿下来。",
        ("伤害", "安全", "愤怒"),
    ),
    (
        ("伤", "痛", "疼", "苦", "绝望", "孤独"),
        "围绕疼痛、失落或孤独感提供情绪教育：允许感受被说出来，帮助用户选择一个很小的自我照顾动作，并鼓励寻求支持。",
        "这个字可能承载着疼痛、失落或孤独。感受不需要立刻被解决，先用一句话说出它、喝一口水或联系一位可信任的人，都是在照顾自己。",
        ("疼痛", "感受", "支持"),
    ),
)


class DoodleReviewError(RuntimeError):
    """上游审核服务不可用或返回不符合契约的内容。"""


@dataclass(frozen=True)
class DoodleReview:
    analysis_id: str
    observation_summary: str
    visual_elements: list[str]
    reflective_questions: list[str]
    gentle_closing: str
    safety_notice: str
    model_version: str
    supportive_response: str = ""
    suggested_question: str = ""
    detected_texts: list[str] = field(default_factory=list)
    risk_level: str = "none"
    knowledge_used: bool = False
    citations: list[dict[str, Any]] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "analysisId": self.analysis_id,
            "observationSummary": self.observation_summary,
            "visualElements": self.visual_elements,
            "reflectiveQuestions": self.reflective_questions,
            "gentleClosing": self.gentle_closing,
            "safetyNotice": self.safety_notice,
            "modelVersion": self.model_version,
            "supportiveResponse": self.supportive_response,
            "suggestedQuestion": self.suggested_question,
            "detectedTexts": self.detected_texts,
            "riskLevel": self.risk_level,
            "knowledgeUsed": self.knowledge_used,
            "citations": self.citations,
        }


def classify_doodle_risk(detected_texts: list[str] | None) -> str:
    """按旧 Java 服务的规则分级:单个沉重字词是 concern,明确计划才是 urgent。"""
    joined = "\n".join(re.sub(r"\s+", "", item) for item in (detected_texts or []) if isinstance(item, str))
    if _URGENT.search(joined):
        return "urgent"
    if any(term in joined for term in _CONCERN_TERMS):
        return "concern"
    return "none"


def _matched_word_guidance(detected_texts: list[str] | None) -> tuple[str, str, tuple[str, ...]] | None:
    joined = "\n".join(
        re.sub(r"\s+", "", item) for item in (detected_texts or []) if isinstance(item, str)
    )
    if not joined:
        return None
    for terms, instruction, fallback, specificity_terms in _WORD_GUIDANCE:
        if any(term in joined for term in terms):
            return instruction, fallback, specificity_terms
    return None


def build_word_guidance(detected_texts: list[str] | None, risk_level: str) -> str:
    """为陪伴模型生成只针对已识别文字的教育说明。"""
    matched = _matched_word_guidance(detected_texts)
    if matched:
        return matched[0]
    if risk_level == "urgent":
        return "文字包含明确的紧急危险信息；优先建议远离危险物品、联系可信任的人和当地紧急服务。"
    return "没有识别到需要专门解释的沉重文字；只基于画面事实给出温和、具体的回应。"


def _normalise_detected_texts(texts: list[str] | None) -> list[str]:
    """清理视觉模型结果，并只合并相邻的已知安全相关词语。"""
    cleaned = [re.sub(r"\s+", "", item).strip() for item in (texts or []) if isinstance(item, str) and item.strip()]
    result: list[str] = []
    index = 0
    while index < len(cleaned):
        match = None
        for size in range(min(4, len(cleaned) - index), 1, -1):
            candidate = "".join(cleaned[index : index + size])
            if candidate in _KNOWN_WORD_PHRASES:
                match = candidate
                index += size
                break
        if match is None:
            match = cleaned[index]
            index += 1
        if match not in result:
            result.append(match)
    return result


def retrieve_doodle_knowledge(
    detected_texts: list[str], risk_level: str, db: Session | None = None
) -> list[dict[str, Any]]:
    """优先走现有向量+关键词 RAG；RAG 暂时不可用时不阻断温和回应。"""
    terms = [item.strip() for item in detected_texts if isinstance(item, str) and item.strip()]
    joined = "".join(terms)
    crisis_kind = ""
    if any(term in joined for term in _SELF_HARM_TERMS):
        crisis_kind = "self-harm"
        terms.extend(["当下安全", "自杀念头", "不要独处", "危险物品", "可信任的人", "紧急求助"])
    elif any(term in joined for term in ("自残", "自伤")):
        crisis_kind = "self-harm"
        terms.extend(["当下安全", "自伤", "危险物品", "不要独处", "专业支持"])
    elif any(term in joined for term in ("杀人", "伤害他人")):
        crisis_kind = "other-harm"
        terms.extend(["他人安全", "冲突降级", "远离危险物品", "紧急求助"])
    elif risk_level == "concern":
        terms.extend(["压力", "支持", "求助", "安全", "自我关怀"])
    elif risk_level == "urgent":
        terms.extend(["紧急", "安全", "伤害", "求助", "支持"])
    query = " ".join(dict.fromkeys(terms))
    if not query:
        return []
    try:
        from app.ai.rag import search as rag_search

        hits = rag_search.search(query, top_k=3, db=db)
        results = [
            {"title": hit.doc_title, "text": (hit.context or hit.text)[:600], "url": ""}
            for hit in hits
        ]
        if crisis_kind:
            results = [item for item in results if _is_crisis_citation_relevant(item, crisis_kind)]
        if results:
            return results
    except Exception:  # noqa: BLE001 - 知识库故障不应阻断基础陪伴
        pass

    # 危机回应不允许用碰巧提到“安全”的普通资料凑数。新增的本地审核知识与向量库
    # 使用同一份 Markdown 源文件；未入库或向量服务暂不可用时，仍可作为可追溯的安全回退。
    if crisis_kind:
        local_knowledge = _load_local_crisis_knowledge()
        if local_knowledge:
            return local_knowledge

    # 向量服务暂不可用时，使用同一业务库中的心理资源做确定性关键词回退。
    own_db = db is None
    session = db
    try:
        if session is None:
            from app.core.database import SessionLocal

            session = SessionLocal()
        from app.models.resource import Resource

        resources = session.query(Resource).filter(Resource.is_active.is_(True)).limit(100).all()
        scored = []
        for resource in resources:
            searchable = f"{resource.title} {resource.content}".lower()
            score = sum(1 for term in terms if term.lower() in searchable)
            citation = {"title": resource.title, "text": resource.content[:600], "url": resource.url or ""}
            if crisis_kind and not _is_crisis_citation_relevant(citation, crisis_kind):
                continue
            if score:
                scored.append((score, resource))
        scored.sort(key=lambda item: (-item[0], item[1].id))
        return [
            {"title": resource.title, "text": resource.content[:600], "url": resource.url or ""}
            for _, resource in scored[:3]
        ]
    except Exception:  # noqa: BLE001 - 资源回退也不能阻断基础陪伴
        return []
    finally:
        if own_db and session is not None:
            session.close()


def _is_crisis_citation_relevant(citation: dict[str, Any], crisis_kind: str) -> bool:
    """危机检索需同时匹配风险主题与当下支持，避免普通资料误入回应。"""
    text = f"{citation.get('title', '')} {citation.get('text', '')}"
    if crisis_kind == "self-harm":
        theme_terms = ("自杀", "自残", "自伤", "不想活", "结束自己", "危机支持", "生命教育")
        action_terms = ("现在安全吗", "安全", "具体计划", "危险物品", "不要独处", "紧急", "可信任的人")
    else:
        theme_terms = ("杀人", "伤害他人", "冲突", "他人安全", "危机支持")
        action_terms = ("安全", "危险物品", "不要独处", "紧急", "可信任的人")
    return any(term in text for term in theme_terms) and any(term in text for term in action_terms)


def _load_local_crisis_knowledge() -> list[dict[str, Any]]:
    """读取随代码版本化的审核知识，作为向量库异常时的 RAG 安全回退。"""
    try:
        text = _CRISIS_KNOWLEDGE_PATH.read_text(encoding="utf-8").strip()
    except OSError:
        return []
    if not text:
        return []
    return [{"title": _CRISIS_KNOWLEDGE_PATH.stem, "text": text[:1200], "url": ""}]


def _field(value: Any, name: str, default: Any = None) -> Any:
    if isinstance(value, dict):
        return value.get(name, default)
    return getattr(value, name, default)


def _response_text(response: Any) -> str:
    if hasattr(response, "json") and callable(response.json) and not _field(response, "output", None):
        try:
            response = response.json()
        except (TypeError, ValueError):
            return ""
    output = _field(response, "output", {})
    choices = _field(output, "choices", []) or []
    if not choices:
        return ""
    message = _field(choices[0], "message", {})
    content = _field(message, "content", "")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(str(_field(item, "text", "")) for item in content if _field(item, "text", None))
    return ""


def _json_object(text: str) -> dict[str, Any]:
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.IGNORECASE)
    try:
        value = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        start, end = cleaned.find("{"), cleaned.rfind("}")
        if start < 0 or end <= start:
            raise DoodleReviewError("审核服务返回的内容不是有效 JSON") from exc
        try:
            value = json.loads(cleaned[start : end + 1])
        except json.JSONDecodeError as nested:
            raise DoodleReviewError("审核服务返回的内容不是有效 JSON") from nested
    if not isinstance(value, dict):
        raise DoodleReviewError("审核服务返回的 JSON 类型错误")
    return value


def _normalise(value: Any, service: ResolvedService) -> DoodleReview:
    def required_text(key: str, max_len: int) -> str:
        text = value.get(key)
        if not isinstance(text, str) or not text.strip() or len(text) > max_len:
            raise DoodleReviewError("审核服务返回字段不完整")
        text = text.strip()
        if _FORBIDDEN.search(text):
            raise DoodleReviewError("审核服务返回内容未通过安全检查")
        return text

    def string_list(key: str, max_items: int) -> list[str]:
        items = value.get(key)
        if not isinstance(items, list) or len(items) > max_items:
            raise DoodleReviewError("审核服务返回数组字段不完整")
        result: list[str] = []
        for item in items:
            if isinstance(item, str) and item.strip():
                result.append(item.strip())
            elif isinstance(item, dict):
                fields = [f"{k}: {v}" for k, v in item.items() if isinstance(k, str) and isinstance(v, (str, int, float))]
                if fields:
                    result.append("; ".join(fields))
        if len(result) != len(items) or len(set(result)) != len(result):
            raise DoodleReviewError("审核服务返回数组字段无效")
        if any(_FORBIDDEN.search(item) for item in result):
            raise DoodleReviewError("审核服务返回内容未通过安全检查")
        return result

    visual_elements = string_list("visualElements", 8)
    reflective_questions = string_list("reflectiveQuestions", 5)
    if not visual_elements:
        raise DoodleReviewError("审核服务返回可见元素为空")
    if not reflective_questions:
        reflective_questions = ["这幅画中哪个可见元素最吸引你的注意？"]
    raw_safety_notice = value.get("safetyNotice")
    if isinstance(raw_safety_notice, list):
        raw_safety_notice = " ".join(item.strip() for item in raw_safety_notice if isinstance(item, str) and item.strip())
        value = {**value, "safetyNotice": raw_safety_notice}
    safety_notice = required_text("safetyNotice", 500)
    if "不是心理判断或诊断" not in safety_notice:
        safety_notice = f"{safety_notice} 这不是心理判断或诊断。"

    return DoodleReview(
        analysis_id=f"doodle-{uuid4().hex}",
        observation_summary=required_text("observationSummary", 800),
        visual_elements=visual_elements,
        reflective_questions=reflective_questions,
        gentle_closing=required_text("gentleClosing", 300),
        safety_notice=safety_notice,
        model_version=service.model,
        supportive_response=required_text("gentleClosing", 500),
    )


def _normalise_facts(value: dict[str, Any], service: ResolvedService) -> dict[str, Any]:
    narrative = value.get("visualNarrative") or value.get("observationSummary")
    if not isinstance(narrative, str) or not narrative.strip() or len(narrative) > 1000:
        raise DoodleReviewError("审核服务返回画面事实不完整")
    texts = value.get("detectedTexts", [])
    if not isinstance(texts, list) or len(texts) > 12 or any(not isinstance(item, str) or not item.strip() for item in texts):
        raise DoodleReviewError("审核服务返回文字字段无效")
    elements = value.get("visualElements", [])
    if not isinstance(elements, list) or len(elements) > 10:
        elements = []
    elements = [item.strip() for item in elements if isinstance(item, str) and item.strip()]
    if not elements:
        elements = [narrative.strip()]
    return {"visualNarrative": narrative.strip(), "detectedTexts": _normalise_detected_texts(texts), "visualElements": elements}


def _complete_sentence(text: str, max_len: int) -> str:
    value = text.strip()
    if len(value) > max_len:
        value = value[:max_len].rstrip("，、；：")
    if value and value[-1] not in "。！？!?；;：:":
        value += "。"
    return value


def _normalise_support(value: dict[str, Any]) -> tuple[str, str]:
    response = value.get("supportiveResponse") or value.get("gentleClosing")
    question = value.get("suggestedQuestion") or "此刻你更希望被倾听，还是想一起做个短暂的放松练习？"
    if not isinstance(response, str) or not response.strip():
        raise DoodleReviewError("陪伴服务返回回应为空")
    if not isinstance(question, str) or not question.strip():
        question = "此刻你更希望被倾听，还是想一起做个短暂的放松练习？"
    response = _complete_sentence(response, 1200)
    question = _complete_sentence(question, 240)
    if _FORBIDDEN.search(response + question):
        raise DoodleReviewError("陪伴服务返回内容未通过安全检查")
    return response, question


def ensure_word_specific_response(response: str, detected_texts: list[str] | None, risk_level: str) -> str:
    """补足模型遗漏的词义教育，避免不同沉重文字回落到相同模板。"""
    matched = _matched_word_guidance(detected_texts)
    if matched is None:
        return _complete_sentence(response, 1200)
    _, fallback, specificity_terms = matched
    normalised = _complete_sentence(response, 1200)
    joined = "".join(item for item in (detected_texts or []) if isinstance(item, str))
    if any(term in joined for term in _SELF_HARM_TERMS):
        # 自杀相关词不能只靠“注意安全”这样的通用答案通过。若模型没有明确承接
        # 识别词、情绪重量、当下安全与下一步行动，就用审核过的完整回应替换它。
        has_word = any(term in normalised for term in _SELF_HARM_TERMS)
        has_empathy = any(term in normalised for term in ("谢谢", "不必一个人", "陪着你", "承受"))
        has_meaning = any(term in normalised for term in ("痛苦", "困境", "感受", "压力", "绝望"))
        has_safety_check = "你现在安全吗" in normalised and any(
            term in normalised for term in ("具体计划", "正在伤害", "危险物品")
        )
        has_next_step = any(term in normalised for term in ("不要独处", "可信任的人", "紧急服务", "学校心理中心"))
        if not all((has_word, has_empathy, has_meaning, has_safety_check, has_next_step)):
            return _complete_sentence(fallback, 1200)
    if any(term in normalised for term in specificity_terms):
        return normalised
    return _complete_sentence(f"{fallback} {normalised}", 1200)


def ensure_word_specific_question(
    question: str, detected_texts: list[str] | None, risk_level: str
) -> str:
    """确保高敏感文字的陪伴问题先确认当下安全，而不是只问开放式感受。"""
    normalised = _complete_sentence(question, 240)
    joined = "".join(item for item in (detected_texts or []) if isinstance(item, str))
    if any(term in joined for term in ("自杀", "结束自己", "不想活", "自残", "自伤")):
        return "你现在安全吗？此刻有没有正在伤害自己、具体计划，或已经准备好的危险物品？你也可以只回复“安全”或“不安全”，我会陪你继续。"
    if any(term in joined for term in ("杀人", "伤害他人")):
        return "你现在和身边的人都安全吗？有没有担心自己会马上伤害谁或已经准备好的危险物品？你可以只回复“安全”或“不安全”。"
    return normalised or "此刻你更希望被倾听，还是想一起做个短暂的放松练习？"


def _call_default(config: ResolvedService, image: bytes, media_type: str, prompt: str = OBSERVATION_PROMPT) -> Any:
    encoded = base64.b64encode(image).decode("ascii")
    response = httpx.post(
        config.base_url.rstrip("/") + "/services/aigc/multimodal-generation/generation",
        headers={
            "Authorization": f"Bearer {config.api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": config.model,
            "input": {
                "messages": [{
                    "role": "user",
                    "content": [
                        {"image": f"data:{media_type};base64,{encoded}"},
                        {"text": prompt},
                    ],
                }],
            },
            "parameters": {
                "enable_thinking": False,
                "temperature": 0.2,
                "max_tokens": max(
                    SUPPORT_MAX_TOKENS if prompt.startswith(SUPPORT_PROMPT) else FACTS_MAX_TOKENS,
                    config.max_tokens or 0,
                ),
                "response_format": {"type": "json_object"},
            },
        },
        timeout=max(1, config.timeout_seconds),
        trust_env=False,
    )
    return response


async def analyze_doodle(
    image: bytes,
    *,
    media_type: str = "image/png",
    db: Session | None = None,
    call: Callable[[ResolvedService, bytes, str], Any] | None = None,
) -> DoodleReview:
    primary = resolve_service("doodle_review")
    services = [primary] + ([primary.fallback] if primary.fallback else [])
    invoke = call or _call_default
    last_error: Exception | None = None
    for service in services:
        if not service or not service.enabled or not service.api_key or not service.base_url or not service.model:
            continue
        try:
            try:
                parameter_count = len(inspect.signature(invoke).parameters)
            except (TypeError, ValueError):
                parameter_count = 4
            invoke_with_prompt = lambda prompt: asyncio.to_thread(
                invoke, service, image, media_type, prompt
            ) if parameter_count >= 4 else asyncio.to_thread(invoke, service, image, media_type)
            response = await invoke_with_prompt(FACTS_PROMPT)
            status = int(_field(response, "status_code", 200) or 200)
            if not 200 <= status < 300:
                raise DoodleReviewError(f"审核服务 HTTP {status}")
            payload = _json_object(_response_text(response))
            # 兼容旧的一次调用契约，避免团队后端仍返回旧字段时被破坏。
            if payload.get("observationSummary") and payload.get("gentleClosing"):
                result = _normalise(payload, service)
                record_usage(primary.service_id)
                return result
            facts = _normalise_facts(payload, service)
            risk_level = classify_doodle_risk(facts["detectedTexts"])
            citations = retrieve_doodle_knowledge(facts["detectedTexts"], risk_level, db)
            support_context = json.dumps(
                {
                    "riskLevel": risk_level,
                    **facts,
                    "wordSpecificGuidance": build_word_guidance(facts["detectedTexts"], risk_level),
                    "citations": citations,
                },
                ensure_ascii=False,
            )
            support_response = await invoke_with_prompt(
                SUPPORT_PROMPT + "\n\n系统提供的画面与知识库上下文：\n" + support_context
            )
            support = _json_object(_response_text(support_response))
            supportive_response, suggested_question = _normalise_support(support)
            supportive_response = ensure_word_specific_response(
                supportive_response, facts["detectedTexts"], risk_level
            )
            suggested_question = ensure_word_specific_question(
                suggested_question, facts["detectedTexts"], risk_level
            )
            safety = "本内容仅为对图像和文字的温和陪伴，不构成心理判断、诊断或评估。"
            result = DoodleReview(
                analysis_id=f"doodle-{uuid4().hex}",
                observation_summary=facts["visualNarrative"],
                visual_elements=facts["visualElements"],
                reflective_questions=[suggested_question],
                gentle_closing=supportive_response,
                safety_notice=safety,
                model_version=service.model,
                supportive_response=supportive_response,
                suggested_question=suggested_question,
                detected_texts=facts["detectedTexts"],
                risk_level=risk_level,
                knowledge_used=bool(citations),
                citations=citations,
            )
            record_usage(primary.service_id)
            return result
        except Exception as exc:  # noqa: BLE001 - 主服务失败后按配置尝试备用服务
            last_error = exc
            record_usage(primary.service_id, failed=True)
    raise DoodleReviewError("画作审核服务暂时不可用") from last_error
