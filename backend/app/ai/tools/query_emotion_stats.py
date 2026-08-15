"""query_emotion_stats 工具(SQL Agent):自然语言 → SQL → 只读执行 → 解释。

安全措施(铁律):
1. LLM 仅负责把自然语言转成 SELECT 语句;
2. sqlglot AST 校验:单条语句、必须为 SELECT、表名白名单;
3. 注入 `WHERE user_id = <uid>`(用户数据隔离,聚合查询同样正确);
4. 强制 LIMIT 100;
5. 只读连接执行(`SET TRANSACTION READ ONLY`),防误写。
"""

import sqlglot
from sqlglot import exp
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.adapters import llm
from app.ai.tools.registry import ToolSpec, registry
from app.core.database import engine as db_engine

ALLOWED_TABLES = {"emotions", "journals", "sessions"}
MAX_ROWS = 100

SQL_GEN_PROMPT = (
    "你是 SQL 生成器。把用户关于自己情绪数据的问题转成一条 PostgreSQL SELECT 语句。"
    "只允许查询表:emotions / journals / sessions;只输出 SQL 本身,"
    "不要分号、不要注释、不要解释。"
)

EXPLAIN_PROMPT = (
    "你是数据分析助手。把下面的查询结果用温暖、清晰的中文解释给用户(3 句话以内)。"
)


def _generate_sql(question: str) -> str:
    return llm.complete_text(SQL_GEN_PROMPT, question, temperature=0).strip()


def _validate(sql: str) -> exp.Select:
    """AST 校验:单语句 + SELECT + 表白名单;不合法抛 ValueError。"""
    try:
        statements = sqlglot.parse(sql, read="postgres")
    except Exception as exc:  # noqa: BLE001  语法错误统一拒绝
        raise ValueError("SQL 语法无效") from exc
    if len(statements) != 1:
        raise ValueError("仅支持单条 SELECT 语句")
    tree = statements[0]
    if not isinstance(tree, exp.Select):
        raise ValueError("仅允许 SELECT 查询")
    tables = [t.name for t in tree.find_all(exp.Table)]
    if not tables:
        raise ValueError("未解析到查询表")
    bad = [t for t in tables if t not in ALLOWED_TABLES]
    if bad:
        raise ValueError(f"查询表不在白名单: {', '.join(bad)}")
    return tree


def _execute_readonly(tree: exp.Select, user_id: int) -> list[dict]:
    """注入 user_id 过滤 + LIMIT,只读事务执行。"""
    injected = tree.where(f"user_id = {int(user_id)}").limit(MAX_ROWS)
    clean_sql = injected.sql(dialect="postgres")

    with db_engine.connect() as conn:
        conn.execute(text("SET TRANSACTION READ ONLY"))
        result = conn.execute(text(clean_sql))
        cols = list(result.keys())
        return [dict(zip(cols, row)) for row in result.fetchall()]


def _stats(db: Session, user_id: int, session_id: int, question: str, **kwargs) -> dict:
    sql = _generate_sql(question)
    tree = _validate(sql)
    rows = _execute_readonly(tree, user_id)
    explanation = llm.complete_text(
        EXPLAIN_PROMPT,
        f"问题:{question}\n结果:{rows}",
        temperature=0.3,
    ).strip()
    return {
        "type": "emotion_stats",
        "question": question,
        "rows": rows,
        "row_count": len(rows),
        "explanation": explanation,
    }


registry.register(
    ToolSpec(
        name="query_emotion_stats",
        description=(
            "用户想了解自己的情绪数据统计(如最近情绪分布/压力来源/日记数量)时调用:"
            "把自然语言问题转成 SQL 查询本人的情绪档案数据并解释结果。"
        ),
        parameters={
            "type": "object",
            "properties": {
                "question": {"type": "string", "description": "关于本人情绪数据的统计问题"}
            },
            "required": ["question"],
        },
        handler=_stats,
    )
)
