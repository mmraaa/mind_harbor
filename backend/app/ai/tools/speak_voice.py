"""speak_voice 工具:流式语音陪伴(TTS 合成,base64 随卡片返回)。

TTS 供应商适配未完成(阿里云百炼 CosyVoice 为异步任务 API)时,
降级为纯文本卡片,保证对话闭环不因语音不可用而中断。
"""

import base64
import logging

from sqlalchemy.orm import Session

from app.adapters import tts
from app.ai.tools.registry import ToolSpec, registry

logger = logging.getLogger(__name__)

MAX_TTS_CHARS = 200


def _speak(db: Session, user_id: int, session_id: int, text: str, **kwargs) -> dict:
    try:
        audio = tts.synthesize(text[:MAX_TTS_CHARS])
    except Exception:  # noqa: BLE001  TTS 未配置/供应商不兼容 → 降级文本卡片
        logger.warning("TTS 合成失败,降级为文本卡片(详见日志)")
        return {
            "type": "voice",
            "text": text[:MAX_TTS_CHARS],
            "audio_b64": None,
            "format": "mp3",
            "degraded": True,
            "note": "语音暂不可用,先看文字版",
        }
    return {
        "type": "voice",
        "text": text[:MAX_TTS_CHARS],
        "audio_b64": base64.b64encode(audio).decode(),
        "format": "mp3",
    }


registry.register(
    ToolSpec(
        name="speak_voice",
        description=(
            "用户感到孤单/难过、希望被温柔的声音安抚,或回复内容适合用语音陪伴时调用:"
            "把一段安抚/鼓励的话合成为语音推给前端(即使未明确说'语音',当对话适合朗读安抚时也应主动调用)。"
            "text 为要朗读的内容(200 字以内)。"
        ),
        parameters={
            "type": "object",
            "properties": {
                "text": {"type": "string", "description": "要朗读的安抚/鼓励文字"}
            },
            "required": ["text"],
        },
        handler=_speak,
    )
)
