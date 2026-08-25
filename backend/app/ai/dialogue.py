"""对话控制器:识别 → 风险 → 记忆 → 提示词 → LLM 流式 → 写 Message → (日记闭环)。

对外产生 SSE 事件 dict 流,事件格式:
    {"type": "text"|"tool_card"|"journal"|"error", "payload": {...}}
格式化成 `data: {json}\n\n` 由 `app/api/chat.py` 负责。
"""

import base64
import logging
from typing import Iterator

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.adapters import llm, tts
from app.ai import agent, emotion, journal, memory
from app.ai.emotion import RISK_REPLY_TEMPLATE
from app.ai.speakable import to_speakable
from app.models.emotion import Emotion, Journal
from app.models.session import ChatSession, Message
from app.models.user import User
from app.schemas.chat import ChatRequest
from app.services import user_memory as user_memory_service
from app.services import user_profile

logger = logging.getLogger(__name__)

# 给前端的通用异常文案:内部错误细节只进日志,不外泄
GENERIC_ERROR_MSG = "生成过程出现异常,请稍后重试"
BLANK_CONTENT_MSG = "消息内容不能为空"

SYSTEM_PROMPT = (
    "你是 MindHarbor 的小屿,面向大学生的 AI 心理咨询与情感陪伴助手。"
    "请用温暖、共情、不评判的语气陪伴用户,用中文回应。"
    "涉及心理危机(自伤/自杀念头)时,"
    "务必引导用户联系危机干预热线 400-161-9995 或校内心理咨询中心。"
    "不做诊断,不承诺保密,回复简洁自然(一般不超过 200 字)。"
)

RISK_CARD = {
    "type": "crisis",
    "hotline": "400-161-9995",
    "note": "心理危机干预热线 / 校内心理咨询中心(工作时间可直接预约)",
}

# —— 语音流式(句子级 TTS)切句规则 ——
_SENT_PUNCT = ("。", "！", "？", "!", "?", "；", ";", "\n")
_MAX_SENT_LEN = 20


def _take_first_sentence(buf: str) -> str | None:
    """返回缓冲区首个完整句(以标点或达长度上限为界);未完整返回 None。"""
    for i, ch in enumerate(buf):
        if ch in _SENT_PUNCT:
            return buf[: i + 1]
    if len(buf) >= _MAX_SENT_LEN:
        return buf[:_MAX_SENT_LEN]
    return None


def get_or_create_session(db: Session, user: User, session_id: int | None) -> ChatSession:
    """校验或创建会话;非本人会话 403,不存在 404,已结束会话 400(仅可浏览,不能续聊)。"""
    if session_id is None:
        session = ChatSession(user_id=user.id)
        db.add(session)
        db.commit()
        db.refresh(session)
        return session
    session = db.get(ChatSession, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "会话不存在")
    if session.user_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "无权访问该会话")
    if session.status == "closed":
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "会话已结束,只能浏览历史,无法继续对话",
        )
    return session


def _load_messages(db: Session, session_id: int) -> list[Message]:
    return db.query(Message).filter_by(session_id=session_id).order_by(Message.id).all()


def _sse(evt_type: str, payload: dict) -> dict:
    return {"type": evt_type, "payload": payload}


def stream_reply(*, content: str, context: str = "") -> Iterator[str]:
    """LLM 流式回复增量(净文本片段)。供 HTTP SSE 与语音通道共用。

    Args:
        content: 用户本轮消息。
        context: 已拼装上下文(记忆 + Agent 工具结果),可空。

    Returns:
        Iterator[str]: 逐 delta 的回复文本增量;调用方负责拼接/落库。
    """
    prompt = SYSTEM_PROMPT + ("\n\n" + context if context else "")
    yield from llm.stream_chat(
        [{"role": "system", "content": prompt}, {"role": "user", "content": content}]
    )


def _tts_chunk(session_id: int, seq: int, sentence: str) -> dict | None:
    """合成一句语音;Markdown/表情清洗后无可读内容则跳过,不打供应商。"""
    spoken = to_speakable(sentence)
    if not spoken:
        logger.info("TTS 跳过不可朗读句(session_id=%s, raw=%r)", session_id, sentence[:80])
        return None
    try:
        audio = tts.synthesize(spoken)
    except Exception:  # noqa: BLE001 单句 TTS 失败:跳过该句音频,文本不受影响
        logger.exception("TTS 句合成失败(session_id=%s)", session_id)
        return None
    return {
        "seq": seq,
        "text": spoken,
        "data": base64.b64encode(audio).decode("ascii"),
        "format": "mp3",
    }


def chat_stream(
    db: Session,
    user: User,
    session: ChatSession,
    body: ChatRequest,
) -> Iterator[dict]:
    """一次对话主流程:情绪识别 → 风险筛查 → 记忆拼装 → LLM 流式回复 → 写 Message。

    - 风险命中:直接输出风险模板(text) + 危机卡片(tool_card),会话 risk_level=high;
    - RAG 命中:追加来源引用 tool_card;
    - end_session=True:生成情绪日记(Journal+Emotion 原子落库)并输出 journal 卡片。
    """
    content = body.content.strip()
    if not content:
        yield _sse("error", {"message": BLANK_CONTENT_MSG})
        return

    prev = _load_messages(db, session.id)
    if not prev and session.title == "新会话":
        session.title = content[:20]
        db.add(session)

    # 1) 用户消息落库
    db.add(Message(session_id=session.id, role="user", content=content))
    db.flush()

    # 2) 情绪识别 + 风险筛查(携带多轮上下文:简短回复如"嗯/没事"需结合历史判断)
    emo = emotion.analyze(
        content,
        history=[(m.role, m.content) for m in prev[-6:]],
        summary=session.summary,
    )
    if emo.is_risk:
        session.risk_level = "high"
        db.add(
            Message(
                session_id=session.id,
                role="assistant",
                content=RISK_REPLY_TEMPLATE,
                emotion_tags=[emo.category],
            )
        )
        db.commit()
        yield _sse("text", {"content": RISK_REPLY_TEMPLATE})
        yield _sse("tool_card", RISK_CARD)
        if body.end_session:
            yield from _finish_session(db, user, session)
        return

    # 3) 记忆拼装(RAG 检索交由 Agent 按需调用 search_knowledge 工具,见 step 3.5;
    #    不再每轮自动检索,避免与工具重复、节省 embedding 调用)
    msgs = _load_messages(db, session.id)
    context = memory.assemble_context(session, msgs, user.id, db)

    # 3.5) Agent 工具循环(呼吸/提醒/资源/情绪统计/语音/情绪记录等)
    tool_cards, tool_context = agent.run(
        db, user.id, session.id, content, SYSTEM_PROMPT, context
    )
    for card in tool_cards:
        yield _sse("tool_card", card)
    if tool_context:
        context = context + "\n\n" + tool_context
    tool_cards = tool_cards or None  # 供第 6 步持久化到 Message

    # 4) LLM 流式生成 + 增量 text 事件(复用 stream_reply,语音通道同入口)
    #    语音扩展:voice_reply=True 时按句流式 TTS,audio_chunk 紧跟对应文本句 → “语音跟得上文本”
    voice_on = bool(body.voice_reply)
    chunks: list[str] = []
    buf = ""
    audio_seq = 0
    for delta in stream_reply(content=content, context=context):
        chunks.append(delta)
        yield _sse("text", {"content": delta})
        if not voice_on:
            continue
        buf += delta
        while (sentence := _take_first_sentence(buf)) is not None:
            buf = buf[len(sentence):]
            payload = _tts_chunk(session.id, audio_seq, sentence)
            if payload is None:
                continue
            yield _sse("audio_chunk", payload)
            audio_seq += 1
    reply = "".join(chunks).strip()
    # 流结束:尾部未到句界的残余也合成语音(保证整段可朗读)
    if voice_on and buf.strip():
        payload = _tts_chunk(session.id, audio_seq, buf)
        if payload:
            yield _sse("audio_chunk", payload)

    # 6) 助手消息落库 + 记忆更新(工具卡片随消息持久化,历史回放可见)
    db.add(
        Message(
            session_id=session.id,
            role="assistant",
            content=reply,
            emotion_tags=[emo.category],
            tool_cards=tool_cards or None,
        )
    )
    memory.update(session, _load_messages(db, session.id), user.id, db)
    db.commit()

    # 7) 会话结束 → 情绪日记闭环
    if body.end_session:
        yield from _finish_session(db, user, session)


def journal_payload(db: Session, j: Journal) -> dict:
    """把 Journal(含关联 Emotion)序列化为事件/接口统一载荷。"""
    emo = db.query(Emotion).filter_by(journal_id=j.id).first()
    payload: dict = {
        "journal_id": j.id,
        "summary": j.summary,
        "content": j.content,
        "mood_score": j.mood_score,
    }
    if emo is not None:
        payload["emotion"] = {
            "category": emo.category,
            "intensity": emo.intensity,
            "stress_source": emo.stress_source,
            "support_need": emo.support_need,
        }
    return payload


def finish_session(db: Session, user: User, session: ChatSession) -> dict:
    """结束会话(手动结束 / SSE end_session 共用):

    情绪日志生成(Journal+Emotion 原子落库,唯一情绪写入路径)→ 标记 closed →
    依据情绪日志沉淀长期记忆。返回统一日记载荷(JSON)。
    """
    j = journal.generate(session.id, db, user.id)
    session.status = "closed"
    memory.settle_long_term_memory(db, user.id)
    try:
        user_memory_service.extract_session_candidates(db, user.id, session.id)
    except Exception:  # noqa: BLE001
        logger.exception("个性化记忆提取失败(session_id=%s, user_id=%s)", session.id, user.id)
    try:
        # 画像观察是可选的、低优先级派生数据；失败不能影响会话闭环。
        user_profile.observe_session(db, user.id, session.id)
    except Exception:  # noqa: BLE001 - 画像异常仅记录，不阻断日记保存
        logger.exception("用户画像观察失败(session_id=%s, user_id=%s)", session.id, user.id)
    db.commit()
    return journal_payload(db, j)


def _finish_session(db: Session, user: User, session: ChatSession) -> Iterator[dict]:
    """SSE 流内收尾:复用 `finish_session`,输出 journal 卡片事件。"""
    try:
        payload = finish_session(db, user, session)
    except Exception:  # noqa: BLE001  LLM 失败不应中断整个流;详情进日志,前端只收通用文案
        logger.exception("日记生成失败(session_id=%s, user_id=%s)", session.id, user.id)
        yield _sse("error", {"message": GENERIC_ERROR_MSG})
        return
    yield _sse("journal", payload)
