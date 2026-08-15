"""recommend_resources 工具:按用户需求/情绪推荐心理资源。"""

from sqlalchemy.orm import Session

from app.ai.tools.registry import ToolSpec, registry
from app.models.resource import Resource


def _resources(db: Session, user_id: int, session_id: int, need: str | None = None, **kwargs) -> dict:
    q = db.query(Resource).filter_by(is_active=True)
    if need and need.strip():
        pattern = f"%{need.strip()}%"
        q = q.filter(Resource.title.ilike(pattern) | Resource.content.ilike(pattern))
    rows = q.order_by(Resource.id).limit(5).all()
    return {
        "type": "resources",
        "count": len(rows),
        "resources": [
            {
                "id": r.id,
                "title": r.title,
                "type": r.type,
                "content": r.content[:200],
                "url": r.url,
            }
            for r in rows
        ],
    }


registry.register(
    ToolSpec(
        name="recommend_resources",
        description=(
            "用户需要心理资源(求助渠道/科普文章/心理游戏/心理书籍)时调用,"
            "按 need 关键词匹配资源库并返回卡片列表。"
            "将返回的相应的内容介绍给用户, 并且附上URL"
        ),
        parameters={
            "type": "object",
            "properties": {
                "need": {"type": "string", "description": "需求关键词,如 考试压力 / 失眠 / 求助渠道 / 心理资源"}
            },
            "required": [],
        },
        handler=_resources,
    )
)
