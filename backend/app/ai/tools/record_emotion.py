"""record_emotion 工具:为用户记录当前情绪。

铁律遵守:情绪记录只在 LLM 生成情绪日记时产出——本工具不直接写
`emotions` 表,而是立即为当前会话生成一篇情绪日记(`journal.generate`),
Journal + Emotion 原子落库(唯一写入路径保持不变)。
"""

from sqlalchemy.orm import Session

from app.ai import journal
from app.ai.tools.registry import Handler, ToolSpec, registry
from app.models.emotion import Emotion


def _record(db: Session, user_id: int, session_id: int, **kwargs) -> dict:
    j = journal.generate(session_id, db, user_id)
    emo = db.query(Emotion).filter_by(journal_id=j.id).first()
    payload: dict = {
        "type": "journal_record",
        "journal_id": j.id,
        "summary": j.summary,
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


registry.register(
    ToolSpec(
        name="record_emotion",
        description=(
            "用户希望记录此刻的情绪时调用:立即基于当前会话内容生成一篇情绪日记,"
            "并沉淀情绪类别/强度/压力来源(供情绪档案与趋势使用)。"
        ),
        parameters={"type": "object", "properties": {}, "required": []},
        handler=_record,
    )
)
