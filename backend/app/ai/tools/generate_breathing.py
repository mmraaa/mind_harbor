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
    },
    "box": {
        "name": "四方呼吸",
        "steps": [
            "吸气 4 秒 → 屏息 4 秒 → 呼气 4 秒 → 屏息 4 秒",
            "想象沿着正方形的边依次进行",
            "重复 5 组",
        ],
    },
    "count": {
        "name": "数息练习",
        "steps": [
            "闭眼,自然呼吸",
            "每次呼气时默数:1、2、3……数到 10",
            "走神了就温柔地回到 1 重新开始",
            "持续 3-5 分钟",
        ],
    },
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
            "参数 exercise 可选:478(478 呼吸)/ box(四方呼吸)/ count(数息)。"
        ),
        parameters={
            "type": "object",
            "properties": {
                "exercise": {
                    "type": "string",
                    "enum": ["478", "box", "count"],
                    "description": "呼吸练习类型,缺省 478",
                }
            },
            "required": [],
        },
        handler=_breathing,
    )
)
