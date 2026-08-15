"""对话控制器:识别 → 风险 → 记忆 → 提示词 → LLM 流式 → 写 Message → (日记闭环)。

对外产生 SSE 事件 dict 流,事件格式:
    {"type": "text"|"tool_card"|"journal"|"error", "payload": {...}}
格式化成 `data: {json}\n\n` 由 `app/api/chat.py` 负责。
"""

import logging
from typing import Iterator

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.adapters import llm
from app.ai import emotion, journal, memory
from app.ai.emotion import RISK_REPLY_TEMPLATE
from app.ai.rag import search as rag_search
from app.models.emotion import Emotion
from app.models.session import ChatSession, Message
from app.models.user import User
from app.schemas.chat import ChatRequest

logger = logging.getLogger(__name__)

# 给前端的通用异常文案:内部错误细节只进日志,不外泄
GENERIC_ERROR_MSG = "生成过程出现异常,请稍后重试"
BLANK_CONTENT_MSG = "消息内容不能为空"

SYSTEM_PROMPT = (
    "你是 MindHarbor,面向大学生的 AI 心理咨询与情感陪伴助手。"
    "请用温暖、共情、不评判的语气陪伴用户,用中文回应。"
    "结合【知识参考】回答知识类问题;涉及心理危机(自伤/自杀念头)时,"
    "务必引导用户联系危机干预热线 400-161-9995 或校内心理咨询中心。"
    "不做诊断,不承诺保密,回复简洁自然(一般不超过 200 字)。"
)

RISK_CARD = {
    "type": "crisis",
    "hotline": "400-161-9995",
    "note": "心理危机干预热线 / 校内心理咨询中心(工作时间可直接预约)",
}


def get_or_create_session(db: Session, user: User, session_id: int | None) -> ChatSession:
    """校验或创建会话;非本人会话 403,不存在 404。"""
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
    return session


def _load_messages(db: Session, session_id: int) -> list[Message]:
    return db.query(Message).filter_by(session_id=session_id).order_by(Message.id).all()


def _sse(evt_type: str, payload: dict) -> dict:
    return {"type": evt_type, "payload": payload}


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

    # 2) 情绪识别 + 风险筛查
    emo = emotion.analyze(content)
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

    # 3) RAG 检索 + 记忆拼装
    hits = rag_search.search(content, top_k=3, db=db)
    msgs = _load_messages(db, session.id)
    context = memory.assemble_context(session, msgs, user.id, db, rag_hits=hits)

    # 4) LLM 流式生成 + 增量 text 事件
    prompt = SYSTEM_PROMPT + "\n\n" + context
    chunks = []
    for delta in llm.stream_chat(
        [{"role": "system", "content": prompt}, {"role": "user", "content": content}]
    ):
        chunks.append(delta)
        yield _sse("text", {"content": delta})
    reply = "".join(chunks).strip()

    # 5) 工具卡片(知识引用来源)
    tool_cards = None
    if hits:
        tool_cards = [
            {"type": "sources", "sources": [{"title": h.doc_title, "text": h.text[:200]} for h in hits]}
        ]
        yield _sse("tool_card", tool_cards[0])

    # 6) 助手消息落库 + 记忆更新
    db.add(
        Message(
            session_id=session.id,
            role="assistant",
            content=reply,
            emotion_tags=[emo.category],
            tool_cards=tool_cards,
        )
    )
    memory.update(session, _load_messages(db, session.id), user.id, db)
    db.commit()

    # 7) 会话结束 → 情绪日记闭环
    if body.end_session:
        yield from _finish_session(db, user, session)


def _finish_session(db: Session, user: User, session: ChatSession) -> Iterator[dict]:
    """会话收尾:LLM 生成情绪日记(Journal+Emotion 原子落库)并输出 journal 卡片事件。"""
    try:
        j = journal.generate(session.id, db, user.id)
    except Exception:  # noqa: BLE001  LLM 失败不应中断整个流;详情进日志,前端只收通用文案
        logger.exception("日记生成失败(session_id=%s, user_id=%s)", session.id, user.id)
        yield _sse("error", {"message": GENERIC_ERROR_MSG})
        return
    session.status = "closed"
    db.commit()

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
    yield _sse("journal", payload)
