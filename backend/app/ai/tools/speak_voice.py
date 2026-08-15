"""speak_voice 工具:流式语音陪伴(TTS 合成,base64 随卡片返回)。"""

import base64

from sqlalchemy.orm import Session

from app.adapters import tts
from app.ai.tools.registry import ToolSpec, registry

MAX_TTS_CHARS = 200


def _speak(db: Session, user_id: int, session_id: int, text: str, **kwargs) -> dict:
    audio = tts.synthesize(text[:MAX_TTS_CHARS])
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
            "用户希望用语音陪伴(读一段安抚/鼓励的话,或回应'用语音对我说')时调用:"
            "把一句温暖的话合成为语音。text 为要朗读的内容(200 字以内)。"
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
