"""generate_breathing 工具:呼吸练习分步引导(内置模板,不调 LLM)。"""

from sqlalchemy.orm import Session

from app.ai.tools.registry import ToolSpec, registry

BREATHING_EXERCISES: dict[str, dict] = {
    "478": {
        "name": "478 呼吸",
        "steps": [
            "找一个舒适的姿势,放松肩膀",
            "用鼻子慢慢吸气,默数 4 秒",
            "屏住呼吸,默数 7 秒",
            "用嘴缓缓呼气,默数 8 秒",
            "重复 4 组,感受身体的放松",
        ],
    }
}
DEFAULT_EXERCISE = "478"


def _breathing(db: Session, user_id: int, session_id: int, exercise: str = DEFAULT_EXERCISE, **kwargs) -> dict:
    ex = BREATHING_EXERCISES.get(exercise) or BREATHING_EXERCISES[DEFAULT_EXERCISE]
    return {
        "type": "breathing",
        "exercise": exercise if exercise in BREATHING_EXERCISES else DEFAULT_EXERCISE,
        "name": ex["name"],
        "steps": ex["steps"],
    }


registry.register(
    ToolSpec(
        name="generate_breathing",
        description=(
            "用户感到紧张/焦虑、需要即时平复时调用:提供呼吸练习分步引导。"
            "参数 exercise :478(478 呼吸)"
        ),
        parameters={
            "type": "object",
            "properties": {
                "exercise": {
                    "type": "string",
                    "enum": ["478"],
                    "description": "呼吸练习类型,缺省 478",
                }
            },
            "required": [],
        },
        handler=_breathing,
    )
)
