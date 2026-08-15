"""search_knowledge 工具:在心理科普知识库中检索并返回带来源的引用。"""

from sqlalchemy.orm import Session

from app.ai.rag import search as rag_search
from app.ai.tools.registry import ToolSpec, registry


def _search(db: Session, user_id: int, session_id: int, query: str, **kwargs) -> dict:
    hits = rag_search.search(query, top_k=3, db=db)
    return {
        "type": "knowledge",
        "count": len(hits),
        "hits": [
            {"title": h.doc_title, "text": h.text[:300]} for h in hits
        ],
    }


registry.register(
    ToolSpec(
        name="search_knowledge",
        description=(
            "在心理健康科普知识库中检索(心理常识/校园咨询流程/压力情境/自助练习)。"
            "用户问及专业知识或需要科普资料时调用;返回带来源的引用,禁止凭空回答。"
        ),
        parameters={
            "type": "object",
            "properties": {"query": {"type": "string", "description": "检索问题"}},
            "required": ["query"],
        },
        handler=_search,
    )
)
