"""语音桥接模块(对标 AI 面试官"语音桥接"功能点):POST /voice/bridge/chat(SSE)。

浏览器 ASR 出文本 → 用户确认 → 桥接接口 → 完整对话闭环:
    text(流式增量)→ 全部文本后 TTS 合成 → audio_url{url,text}(流式不冲突:
    文本先行渲染,音频 URL 到尾部,前端 <audio> 播放 URL 边下边播)。
事件:text / audio_url / journal / error(索引格式与 chat.py 的 SSE 一致)。
"""

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.adapters import tts
from app.ai import agent, dialogue, emotion, memory
from app.ai.emotion import RISK_REPLY_TEMPLATE
from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.session import ChatSession, Message
from app.models.user import User
from app.schemas.chat import ChatRequest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/voice", tags=["voice"])


def _sse(evt_type: str, payload: dict) -> dict:
    return {"type": evt_type, "payload": payload}


def _begin_or_reuse_session(db: Session, user: User, content: str, session_id: int | None) -> ChatSession:
    if session_id is not None:
        session = db.get(ChatSession, session_id)
        if session is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "会话不存在")
        if session.user_id != user.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "无权访问该会话")
        if session.status == "closed":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "会话已结束,不能续聊")
        return session
    session = ChatSession(user_id=user.id, title=content[:20])
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def _bridge_events(db: Session, user: User, session: ChatSession, content: str, *, end_session: bool):
    """桥接事件生成器:情绪/风险 → 记忆+Agent 上下文 → 流式 text → audio_url →(可选)journal。"""
    db.add(Message(session_id=session.id, role="user", content=content))
    db.flush()
    prev = db.query(Message).filter_by(session_id=session.id).order_by(Message.id).all()

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
        return

    context = memory.assemble_context(session, prev, user.id, db)
    cards, tool_context = agent.run(db, user.id, session.id, content, dialogue.SYSTEM_PROMPT, context)
    if tool_context:
        context = context + "\n\n" + tool_context

    chunks: list[str] = []
    for delta in dialogue.stream_reply(content=content, context=context):
        chunks.append(delta)
        yield _sse("text", {"content": delta})
    reply = "".join(chunks).strip()

    db.add(
        Message(
            session_id=session.id,
            role="assistant",
            content=reply,
            emotion_tags=[emo.category],
            tool_cards=cards or None,
        )
    )
    memory.update(
        session,
        db.query(Message).filter_by(session_id=session.id).order_by(Message.id).all(),
        user.id,
        db,
    )
    db.commit()

    # TTS:在文本流完成后再合成,audio_url 作为流尾部事件 → 文本与语音不冲突
    if reply:
        try:
            audio = tts.synthesize_with_url(reply)
            yield _sse("audio_url", {"url": audio["url"], "text": reply})
        except Exception:  # noqa: BLE001 TTS 不可用 → degraded,不影响文本
            logger.exception("TTS 合成失败(session_id=%s)", session.id)
            yield _sse("audio_url", {"url": None, "text": reply, "degraded": True})

    if end_session:
        payload = dialogue.finish_session(db, user, session)
        yield _sse("journal", payload)


@router.post("/bridge/chat")
def bridge_chat(
    body: ChatRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """语音桥接:提交识别文本 → SSE(流式 text → audio_url →[journal])。"""
    content = body.content.strip()
    if not content:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "消息内容不能为空")
    session = _begin_or_reuse_session(db, user, content, body.session_id)

    def gen():
        try:
            for ev in _bridge_events(db, user, session, content, end_session=bool(body.end_session)):
                yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"
        except Exception:  # noqa: BLE001 内部异常不外泄
            logger.exception("bridge 处理异常(session_id=%s)", session.id)
            yield (
                "data: "
                + json.dumps({"type": "error", "payload": {"message": "生成过程出现异常,请稍后重试"}}, ensure_ascii=False)
                + "\n\n"
            )

    return StreamingResponse(gen(), media_type="text/event-stream")