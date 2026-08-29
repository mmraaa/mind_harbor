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
            "用户提及或可能受益于心理资源(求助渠道/科普文章/心理书籍/心理游戏)时主动调用:"
            "按 need 关键词匹配资源库并返回卡片列表。"
            "将返回的相应内容介绍给用户,并附上 URL。"
        ),
        parameters={
            "type": "object",
            "properties": {
                "need": {"type": "string", "description": "需求关键词,如 推荐, 书籍, 文章, 游戏, 求助渠道"}
            },
            "required": [],
        },
        handler=_resources,
    )
)
