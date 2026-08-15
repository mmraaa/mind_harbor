"""search_knowledge 工具:在心理科普知识库中检索并返回带来源的引用。

查询词精炼:从口语问题提取核心检索词(去问句语气词/停用词),
再交给 RAG 混合检索(向量 + 关键词 RRF)。
"""

import re

from sqlalchemy.orm import Session

from app.ai.rag import search as rag_search
from app.ai.tools.registry import ToolSpec, registry

# 口语问句中的高频语气词/停用词,精炼时去除
_QUESTION_NOISE = [
    "请问", "我想知道", "我想", "我想要", "我想了解", "我应该", "我该怎么",
    "怎么办", "怎么", "如何", "帮我", "有没有", "可以", "能", "一下", "一些",
]


def _refine_query(query: str) -> str:
    """从口语问题提取核心检索词:去标点/问句语气词/停用词,保留核心短语。"""
    text = re.sub(r"[，。？?！!、\s]+", " ", (query or "").strip())
    for word in _QUESTION_NOISE:
        text = text.replace(word, " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text or query


def _search(db: Session, user_id: int, session_id: int, query: str, **kwargs) -> dict:
    refined = _refine_query(query)
    hits = rag_search.search(refined, top_k=3, db=db)
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
