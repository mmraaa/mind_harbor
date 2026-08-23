"""学生自我觉察画像的授权、问卷基线和渐进式观察。"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from collections import defaultdict

from sqlalchemy.orm import Session

from app.models.profile import UserProfileObservation, UserProfileSettings, UserProfileSnapshot
from app.models.session import ChatSession, Message

EDIT_INTERVAL = timedelta(days=7)
QUESTIONNAIRE_VERSION = "big-five-cn-v1"
BIG_FIVE_DIMENSIONS = (
    "openness",
    "conscientiousness",
    "extraversion",
    "agreeableness",
    "emotional_sensitivity",
)
BIG_FIVE_LABELS = {
    "openness": "开放性",
    "conscientiousness": "尽责性",
    "extraversion": "外向性",
    "agreeableness": "宜人性",
    "emotional_sensitivity": "情绪敏感度",
}
LIKERT_OPTIONS = (
    ("1", "非常不像我"),
    ("2", "不太像我"),
    ("3", "不确定"),
    ("4", "比较像我"),
    ("5", "非常像我"),
)


def _question(question_id: str, dimension: str, prompt: str, reverse: bool = False) -> dict:
    return {
        "id": question_id,
        "dimension": dimension,
        "label": BIG_FIVE_LABELS[dimension],
        "prompt": prompt,
        "reverse": reverse,
        "options": [{"value": value, "label": label} for value, label in LIKERT_OPTIONS],
    }


PROFILE_QUESTIONS = [
    _question("openness_1", "openness", "我喜欢接触与平时不同的新观点。"),
    _question("openness_2", "openness", "我常常会对一个问题展开丰富的想象。"),
    _question("openness_3", "openness", "我愿意尝试新的兴趣、活动或表达方式。"),
    _question("openness_4", "openness", "我更喜欢熟悉的做法，不太愿意改变。", True),
    _question("openness_5", "openness", "遇到复杂问题时，我通常不会去了解背后的不同可能。", True),
    _question("openness_6", "openness", "我很少被艺术、故事或新鲜事物吸引。", True),
    _question("conscientiousness_1", "conscientiousness", "我会提前安排重要的任务和时间。"),
    _question("conscientiousness_2", "conscientiousness", "我答应别人的事情通常会尽力做到。"),
    _question("conscientiousness_3", "conscientiousness", "我会把大目标拆成下一步可以执行的小行动。"),
    _question("conscientiousness_4", "conscientiousness", "我经常拖到最后一刻才开始处理重要事情。", True),
    _question("conscientiousness_5", "conscientiousness", "计划被打乱后，我很难重新整理节奏。", True),
    _question("conscientiousness_6", "conscientiousness", "我常常忽略已经答应或需要完成的事情。", True),
    _question("extraversion_1", "extraversion", "和熟悉的人交流通常会让我恢复能量。"),
    _question("extraversion_2", "extraversion", "我愿意主动认识新的人或加入集体活动。"),
    _question("extraversion_3", "extraversion", "我通常能比较自然地表达自己的想法。"),
    _question("extraversion_4", "extraversion", "在人多的场合，我往往只想尽快离开。", True),
    _question("extraversion_5", "extraversion", "我很少主动发起聊天或邀请别人一起做事。", True),
    _question("extraversion_6", "extraversion", "即使有想法，我也经常选择保持沉默。", True),
    _question("agreeableness_1", "agreeableness", "我会认真考虑别人的感受，再表达不同意见。"),
    _question("agreeableness_2", "agreeableness", "看到身边的人需要帮助时，我愿意提供支持。"),
    _question("agreeableness_3", "agreeableness", "发生冲突时，我愿意寻找双方都能接受的办法。"),
    _question("agreeableness_4", "agreeableness", "我通常不在意别人的感受，只要事情按我的想法进行。", True),
    _question("agreeableness_5", "agreeableness", "我很难相信别人是出于善意。", True),
    _question("agreeableness_6", "agreeableness", "当别人犯错时，我容易先责备而不是先了解原因。", True),
    _question("emotional_sensitivity_1", "emotional_sensitivity", "我能敏锐察觉到自己的情绪变化。"),
    _question("emotional_sensitivity_2", "emotional_sensitivity", "压力大时，身体或情绪的反应会比较明显。"),
    _question("emotional_sensitivity_3", "emotional_sensitivity", "别人的评价有时会在我心里停留很久。"),
    _question("emotional_sensitivity_4", "emotional_sensitivity", "遇到压力时，我通常很快就能恢复平静。", True),
    _question("emotional_sensitivity_5", "emotional_sensitivity", "即使发生不顺利的事情，我也很少反复担心。", True),
    _question("emotional_sensitivity_6", "emotional_sensitivity", "我的情绪通常不会影响学习、工作或生活安排。", True),
]

_QUESTION_BY_ID = {question["id"]: question for question in PROFILE_QUESTIONS}
_CRISIS = re.compile(r"(自杀|自残|自伤|不想活|结束自己|正在准备|具体计划|危险物品)")
_EXCLUDED_PROFILE_CONTENT = re.compile(r"(随手画|画作|涂鸦|练习题|测试答案|提醒内容)")

QUESTIONNAIRE_OPTIONS = {
    "support_style": {
        "listen_first": "先倾听，再给建议",
        "direct_steps": "直接给我可执行的步骤",
        "knowledge": "先解释原理和信息",
    },
    "coping_style": {
        "small_steps": "把事情拆成很小的步骤",
        "body_practice": "呼吸、感官或身体练习",
        "writing": "写下来，慢慢整理",
    },
    "social_support": {
        "trusted_person": "愿意联系一位信任的人",
        "solo_first": "先自己安静一会儿",
        "professional": "更愿意寻求专业支持",
    },
}

_OBSERVATION_RULES = (
    (
        "support_style",
        "listen_first",
        re.compile(r"先听|听我说|不要马上给建议|先让我说完|只想被听"),
        "用户在会话中明确表达希望先被倾听。",
    ),
    (
        "support_style",
        "direct_steps",
        re.compile(r"给我建议|怎么办|具体步骤|怎么解决|告诉我该做什么"),
        "用户在会话中主动询问具体做法。",
    ),
    (
        "coping_style",
        "small_steps",
        re.compile(r"一步一步|小一点|拆开|先做一件|从简单的开始"),
        "用户提到把问题拆成小步骤会更容易开始。",
    ),
    (
        "coping_style",
        "body_practice",
        re.compile(r"呼吸|放松练习|睡不着|身体很紧|心跳很快"),
        "用户提到呼吸、放松或身体感受相关的调节方式。",
    ),
    (
        "social_support",
        "trusted_person",
        re.compile(r"朋友|家人|信任的人|同学陪我|找人聊聊"),
        "用户提到联系朋友、家人或信任的人。",
    ),
    (
        "interests",
        "阅读、观点与新知探索",
        re.compile(r"喜欢看书|阅读|新的观点|了解新|研究一下|好奇"),
        "用户提到阅读、观点或持续了解新事物。",
    ),
    (
        "thinking_decision",
        "倾向先收集信息、比较利弊再行动",
        re.compile(r"列出利弊|权衡|比较一下|先分析|收集信息|一步一步完成"),
        "用户描述了先分析、比较或拆解后再行动的方式。",
    ),
    (
        "learning_style",
        "偏好具体例子和分步骤练习",
        re.compile(r"举个例子|具体一点|分步骤|一步一步|练习几次|边做边学"),
        "用户提到用具体例子、步骤或练习来理解内容。",
    ),
    (
        "work_environment",
        "偏好安静、有明确安排且保留自主空间的环境",
        re.compile(r"安静.*环境|明确安排|自己安排|自主空间|不喜欢被打断"),
        "用户表达了对安静、结构清晰或自主空间的环境偏好。",
    ),
    (
        "execution_style",
        "倾向用小步骤持续推进",
        re.compile(r"拆成小|先做一件|小目标|逐步|慢慢来|持续完成"),
        "用户提到将任务拆小或持续推进。",
    ),
)


class ProfileEditRateLimited(ValueError):
    """用户画像自助修订尚未到下一次允许时间。"""


class ProfileBaselineAlreadyExists(ValueError):
    """基础画像已建立，应通过每周一次的自助修订入口更新。"""


def _now() -> datetime:
    return datetime.now(timezone.utc)


def get_settings(db: Session, user_id: int) -> UserProfileSettings:
    row = db.query(UserProfileSettings).filter_by(user_id=user_id).first()
    if row is None:
        row = UserProfileSettings(user_id=user_id)
        db.add(row)
        db.flush()
    return row


def _current(db: Session, user_id: int) -> UserProfileSnapshot | None:
    return (
        db.query(UserProfileSnapshot)
        .filter_by(user_id=user_id, is_current=True)
        .order_by(UserProfileSnapshot.version.desc())
        .first()
    )


def score_big_five(answers: dict[str, str]) -> dict[str, dict]:
    """将 30 题答案转换为 0-100 倾向分；缺题或非法答案由调用方拒绝。"""
    totals: dict[str, list[int]] = defaultdict(list)
    for question in PROFILE_QUESTIONS:
        raw = int(answers[question["id"]])
        score = 6 - raw if question["reverse"] else raw
        totals[question["dimension"]].append(score)
    result = {}
    for dimension in BIG_FIVE_DIMENSIONS:
        average = sum(totals[dimension]) / len(totals[dimension])
        score = round((average - 1) * 25)
        level = "偏低" if score < 40 else "偏高" if score >= 67 else "中等"
        result[dimension] = {
            "label": BIG_FIVE_LABELS[dimension],
            "score": score,
            "level": level,
            "description": _dimension_description(dimension, level),
        }
    return result


def _dimension_description(dimension: str, level: str) -> str:
    descriptions = {
        "openness": {"偏低": "更偏好熟悉、具体和稳定的方式。", "中等": "能在熟悉与新鲜之间保持弹性。", "偏高": "容易被新观点、想象和探索激发。"},
        "conscientiousness": {"偏低": "更适合灵活推进，外部结构可能会带来帮助。", "中等": "能在计划与临场调整之间切换。", "偏高": "重视安排、承诺和持续完成。"},
        "extraversion": {"偏低": "更可能从独处或少数熟悉关系中恢复能量。", "中等": "会根据场景选择交流或独处。", "偏高": "互动、表达和群体参与可能带来能量。"},
        "agreeableness": {"偏低": "更重视直接、清晰地表达边界和立场。", "中等": "能在体谅他人与坚持自己之间寻找平衡。", "偏高": "通常重视合作、理解和关系中的善意。"},
        "emotional_sensitivity": {"偏低": "面对波动时通常较快恢复稳定。", "中等": "情绪反应会随情境变化，具备一定调节空间。", "偏高": "对压力、评价和情绪变化更敏锐，需要更充分的恢复时间。"},
    }
    return descriptions[dimension][level]


def _rich_sections(big_five: dict, evidence_count: int, observations: list[dict] | None = None) -> dict:
    if evidence_count < 3:
        return {
            "overall_analysis": "基础倾向已建立，等待至少 3 段结束会话后再进行更完整的整体分析。",
            "thinking_decision": "暂不判断：目前还缺少足够的连续决策过程证据。",
            "learning_style": "暂不判断：目前还缺少足够的学习或执行场景证据。",
            "strengths_blind_spots": "暂不判断：优势与可能盲点需要跨场景证据支持。",
            "interests": "暂不判断：兴趣主题会随着持续对话逐步整理。",
            "career_directions": "暂不判断：这里提供探索方向，不给出职业定论。",
            "work_environment": "暂不判断：目前还缺少对环境偏好的重复证据。",
            "growth_focus": "先观察自己在真实场景中的节奏、需要和有效方法，再决定下一步成长重点。",
        }
    stable = [item for item in (observations or []) if item.get("status") == "stable"]
    values = [item.get("value", "") for item in stable if item.get("value")]
    joined = "、".join(values[:4]) or "稳定的自我观察"
    high = [item["label"] for item in big_five.values() if item.get("level") == "偏高"]
    low = [item["label"] for item in big_five.values() if item.get("level") == "偏低"]
    return {
        "overall_analysis": f"从基础问卷和 {evidence_count} 段对话看，你呈现出较稳定的自我观察线索，近期常出现：{joined}。这些是当前阶段的倾向，不是固定标签。",
        "thinking_decision": "你可能会在收集信息、权衡感受和现实限制后再行动；当任务复杂时，先拆分成下一步会更容易推进。",
        "learning_style": "你更适合把抽象内容转成具体例子，并用短周期回顾来巩固，而不是一次性要求自己完成全部目标。",
        "strengths_blind_spots": f"可能的优势包括{('、'.join(high) or '持续观察和调整')}; 需要留意的盲点可能与{('、'.join(low) or '压力下过度自我要求')}有关。",
        "interests": f"对话中暂时整理出这些兴趣线索：{joined}。后续会根据更多不同场景继续修正。",
        "career_directions": "可以探索需要持续学习、问题拆解与真实沟通的方向；具体选择仍应结合能力、机会和个人体验。",
        "work_environment": "相对适合目标清晰、允许逐步推进，同时保留一定自主空间的环境。",
        "growth_focus": "把一次重要觉察转成一个很小、可复盘的行动，持续记录哪些支持真正有效。",
    }


def _summary(traits: dict, observations: list[dict] | None = None, rich: dict | None = None) -> str:
    values = [item["value"] for item in traits.values() if isinstance(item, dict) and item.get("value")]
    text = "；".join(values[:3])
    result = f"这是一份关于自我倾向与陪伴偏好的觉察记录：{text}。它不是诊断，也不会定义你。"
    stable = [item for item in (observations or []) if item.get("status") == "stable"]
    if stable:
        result += "近期对话也显示，你可能更常需要" + "、".join(item["value"] for item in stable[:2]) + "。"
    if rich and rich.get("overall_analysis"):
        result += " " + rich["overall_analysis"]
    return result


def _content(
    traits: dict,
    observations: list[dict] | None = None,
    *,
    big_five: dict | None = None,
    evidence_count: int = 0,
    questionnaire_version: str = QUESTIONNAIRE_VERSION,
    questionnaire_answers: dict[str, str] | None = None,
) -> dict:
    safe_obs = observations or []
    dimensions = big_five or {}
    rich = _rich_sections(dimensions, evidence_count, safe_obs)
    return {
        "summary": _summary(traits, safe_obs, rich),
        "traits": traits,
        "observations": safe_obs,
        "big_five": dimensions,
        **rich,
        "evidence_count": evidence_count,
        "confidence": min(0.95, 0.45 + evidence_count * 0.12),
        "generated_at": _now().isoformat(),
        "model_version": "deterministic-profile-v1",
        "questionnaire_version": questionnaire_version,
        "questionnaire_answers": questionnaire_answers or {},
    }


def _next_version(db: Session, user_id: int) -> int:
    latest = db.query(UserProfileSnapshot).filter_by(user_id=user_id).order_by(UserProfileSnapshot.version.desc()).first()
    return (latest.version + 1) if latest else 1


def _save_snapshot(db: Session, user_id: int, source: str, content: dict) -> UserProfileSnapshot:
    db.query(UserProfileSnapshot).filter_by(user_id=user_id, is_current=True).update({"is_current": False})
    version = _next_version(db, user_id)
    content = {**content, "profile_version": version}
    row = UserProfileSnapshot(
        user_id=user_id,
        version=version,
        source=source,
        content=content,
        is_current=True,
    )
    db.add(row)
    db.flush()
    return row


def _profile_payload(settings: UserProfileSettings, snapshot: UserProfileSnapshot | None) -> dict:
    content = snapshot.content if snapshot is not None else None
    last_edit = settings.last_self_edit_at or settings.last_manual_edit_at
    items = []
    if content:
        for key, trait in (content.get("traits") or {}).items():
            items.append({
                "key": key,
                "value": trait.get("option", ""),
                "label": trait.get("value", ""),
                "source": trait.get("source", snapshot.source),
                "status": "stable",
            })
    return {
        "enabled": settings.enabled,
        "questionnaire_completed": settings.questionnaire_completed_at is not None,
        "test_completed": settings.questionnaire_completed_at is not None,
        "items": items if settings.enabled else [],
        "consented_at": settings.consented_at.isoformat() if settings.consented_at else None,
        "revoked_at": settings.revoked_at.isoformat() if settings.revoked_at else None,
        "last_self_edit_at": last_edit.isoformat() if last_edit else None,
        "next_self_edit_at": (
            last_edit + EDIT_INTERVAL
        ).isoformat() if last_edit else None,
        "next_manual_edit_at": (
            last_edit + EDIT_INTERVAL
        ).isoformat() if last_edit else None,
        "snapshot": {
            "id": snapshot.id,
            "version": snapshot.version,
            "source": snapshot.source,
            **content,
            "created_at": snapshot.created_at.isoformat() if snapshot.created_at else None,
        } if snapshot is not None else None,
    }


def get_profile(db: Session, user_id: int) -> dict:
    return _profile_payload(get_settings(db, user_id), _current(db, user_id))


def set_consent(db: Session, user_id: int, enabled: bool) -> dict:
    settings = get_settings(db, user_id)
    settings.enabled = enabled
    if enabled:
        settings.consented_at = _now()
        settings.revoked_at = None
    else:
        settings.revoked_at = _now()
    db.commit()
    return get_profile(db, user_id)


def submit_questionnaire(db: Session, user_id: int, answers: dict[str, str]) -> dict:
    settings = get_settings(db, user_id)
    current = _current(db, user_id)
    is_big_five = set(answers) == set(_QUESTION_BY_ID)
    can_upgrade_legacy_baseline = (
        is_big_five
        and current is not None
        and current.content.get("questionnaire_version") != QUESTIONNAIRE_VERSION
    )
    if (
        settings.questionnaire_completed_at is not None
        and current is not None
        and not can_upgrade_legacy_baseline
    ):
        raise ProfileBaselineAlreadyExists("基础画像已经建立，请使用自助修改入口")

    if is_big_five:
        for question in PROFILE_QUESTIONS:
            value = answers.get(question["id"])
            if value not in {option[0] for option in LIKERT_OPTIONS}:
                raise ValueError(f"问卷选项无效: {question['id']}")
        big_five = score_big_five(answers)
        traits = {
            key: {
                "label": item["label"],
                "value": item["level"],
                "option": str(item["score"]),
                "score": item["score"],
                "level": item["level"],
                "source": "questionnaire",
                "confidence": 0.6,
            }
            for key, item in big_five.items()
        }
        content = _content(
            traits,
            big_five=big_five,
            questionnaire_answers=dict(answers),
            questionnaire_version=QUESTIONNAIRE_VERSION,
        )
    else:
        # 保留团队旧的三项问卷契约，便于旧客户端平滑升级。
        traits = {}
        for key, options in QUESTIONNAIRE_OPTIONS.items():
            value = answers.get(key)
            if value not in options:
                raise ValueError(f"问卷选项无效: {key}")
            traits[key] = {
                "label": {"support_style": "陪伴方式", "coping_style": "调节方式", "social_support": "支持来源"}[key],
                "value": options[value],
                "option": value,
                "source": "questionnaire",
                "confidence": 0.6,
            }
        content = _content(traits, questionnaire_version="legacy-v1")
    settings.enabled = True
    settings.consented_at = settings.consented_at or _now()
    settings.questionnaire_completed_at = _now()
    snapshot = _save_snapshot(db, user_id, "questionnaire", content)
    db.commit()
    db.refresh(snapshot)
    return _profile_payload(settings, snapshot)


def self_edit(db: Session, user_id: int, updates: dict[str, str]) -> dict:
    settings = get_settings(db, user_id)
    if not settings.enabled:
        raise ValueError("请先开启画像授权")
    current = _current(db, user_id)
    if current is None:
        raise ValueError("请先完成基础问卷")
    now = _now()
    last_edit = settings.last_self_edit_at or settings.last_manual_edit_at
    if last_edit is not None and now - last_edit < EDIT_INTERVAL:
        raise ProfileEditRateLimited("每 7 天只能自助修改一次个人画像")
    content = dict(current.content)
    traits = {key: dict(value) for key, value in (content.get("traits") or {}).items()}
    observations = list(content.get("observations") or [])
    questionnaire_answers = dict(content.get("questionnaire_answers") or {})
    if content.get("questionnaire_version") == QUESTIONNAIRE_VERSION:
        for key, option in updates.items():
            if key not in _QUESTION_BY_ID or option not in {value for value, _ in LIKERT_OPTIONS}:
                raise ValueError(f"画像修改项无效: {key}")
            questionnaire_answers[key] = option
        if set(questionnaire_answers) != set(_QUESTION_BY_ID):
            raise ValueError("基础问卷答案不完整")
        big_five = score_big_five(questionnaire_answers)
        traits = {
            key: {
                **dict(traits.get(key) or {}),
                "label": item["label"],
                "value": item["level"],
                "option": str(item["score"]),
                "score": item["score"],
                "level": item["level"],
                "source": "manual",
                "confidence": 1.0,
            }
            for key, item in big_five.items()
        }
        content = _content(
            traits,
            observations,
            big_five=big_five,
            evidence_count=int(content.get("evidence_count") or 0),
            questionnaire_answers=questionnaire_answers,
        )
    else:
        for key, option in updates.items():
            if key not in QUESTIONNAIRE_OPTIONS or option not in QUESTIONNAIRE_OPTIONS[key]:
                raise ValueError(f"画像修改项无效: {key}")
            traits[key]["option"] = option
            traits[key]["value"] = QUESTIONNAIRE_OPTIONS[key][option]
            traits[key]["source"] = "manual"
            traits[key]["confidence"] = 1.0
        content = _content(
            traits,
            observations,
            big_five=content.get("big_five") or {},
            evidence_count=int(content.get("evidence_count") or 0),
            questionnaire_version=content.get("questionnaire_version", "legacy-v1"),
            questionnaire_answers=questionnaire_answers,
        )
    settings.last_self_edit_at = now
    settings.last_manual_edit_at = now
    snapshot = _save_snapshot(db, user_id, "manual", content)
    db.commit()
    db.refresh(snapshot)
    return _profile_payload(settings, snapshot)


def _extract_observation(text: str) -> tuple[str, str, str] | None:
    for trait_key, value, pattern, evidence in _OBSERVATION_RULES:
        if pattern.search(text):
            return trait_key, value, evidence
    return None


def _observation_value(trait_key: str, value: str) -> str:
    options = QUESTIONNAIRE_OPTIONS.get(trait_key)
    return options.get(value, value) if options else value


def _profile_evidence_count(db: Session, user_id: int) -> int:
    sessions = db.query(ChatSession).filter_by(user_id=user_id, status="closed").all()
    eligible = 0
    for session in sessions:
        messages = db.query(Message.content).filter_by(session_id=session.id, role="user").all()
        text = "\n".join(row[0] for row in messages)
        if text and not _CRISIS.search(text) and not _EXCLUDED_PROFILE_CONTENT.search(text):
            eligible += 1
    return eligible


def _maybe_enrich_snapshot(db: Session, user_id: int) -> None:
    current = _current(db, user_id)
    if current is None:
        return
    evidence_count = _profile_evidence_count(db, user_id)
    if evidence_count < 3 or current.content.get("evidence_count", 0) >= evidence_count:
        return
    content = dict(current.content)
    traits = {key: dict(item) for key, item in (content.get("traits") or {}).items()}
    observations = [dict(item) for item in (content.get("observations") or [])]
    snapshot = _save_snapshot(
        db,
        user_id,
        "behavior",
        _content(
            traits,
            observations,
            big_five=content.get("big_five") or {},
            evidence_count=evidence_count,
            questionnaire_version=content.get("questionnaire_version", "legacy-v1"),
            questionnaire_answers=content.get("questionnaire_answers") or {},
        ),
    )
    db.flush()


def observe_session(db: Session, user_id: int, session_id: int) -> dict | None:
    settings = get_settings(db, user_id)
    if not settings.enabled or settings.questionnaire_completed_at is None:
        return None
    session = db.get(ChatSession, session_id)
    if session is None or session.user_id != user_id:
        return None
    messages = db.query(Message).filter_by(session_id=session_id, role="user").order_by(Message.id).all()
    text = "\n".join(message.content for message in messages)
    if _CRISIS.search(text) or _EXCLUDED_PROFILE_CONTENT.search(text):
        return None
    match = _extract_observation(text)
    if match is None:
        _maybe_enrich_snapshot(db, user_id)
        db.commit()
        return None
    trait_key, value, evidence = match
    existing = (
        db.query(UserProfileObservation)
        .filter_by(user_id=user_id, session_id=session_id, trait_key=trait_key, value=value)
        .first()
    )
    if existing is not None:
        return {"id": existing.id, "trait_key": trait_key, "value": value, "status": existing.status}
    count = db.query(UserProfileObservation).filter_by(user_id=user_id, trait_key=trait_key, value=value).count()
    status = "stable" if count >= 1 else "candidate"
    observation = UserProfileObservation(
        user_id=user_id,
        session_id=session_id,
        trait_key=trait_key,
        value=value,
        status=status,
        confidence=0.75 if status == "stable" else 0.4,
        evidence=evidence,
    )
    db.add(observation)
    db.flush()
    current = _current(db, user_id)
    if current is not None:
        content = dict(current.content)
        traits = {key: dict(item) for key, item in (content.get("traits") or {}).items()}
        observations = [dict(item) for item in (content.get("observations") or []) if item.get("trait_key") != trait_key]
        observations.append({
            "trait_key": trait_key,
            "value": _observation_value(trait_key, value),
            "status": status,
            "evidence_count": count + 1,
            "confidence": 0.75 if status == "stable" else 0.4,
        })
        evidence_count = _profile_evidence_count(db, user_id)
        big_five = content.get("big_five") or {}
        snapshot = _save_snapshot(
            db,
            user_id,
            "behavior",
            _content(
                traits,
                observations,
                big_five=big_five,
                evidence_count=evidence_count,
                questionnaire_version=content.get("questionnaire_version", "legacy-v1"),
                questionnaire_answers=content.get("questionnaire_answers") or {},
            ),
        )
        db.commit()
        db.refresh(snapshot)
    else:
        db.commit()
    return {"id": observation.id, "trait_key": trait_key, "value": value, "status": status}


def delete_profile(db: Session, user_id: int) -> None:
    db.query(UserProfileObservation).filter_by(user_id=user_id).delete()
    db.query(UserProfileSnapshot).filter_by(user_id=user_id).delete()
    db.query(UserProfileSettings).filter_by(user_id=user_id).delete()
    db.commit()
