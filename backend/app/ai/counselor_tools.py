"""咨询师端工具实现:查询统计(SQL Agent)/ 学生日记 / 异常学生识别。"""

import re
from datetime import date, datetime
from decimal import Decimal

import sqlglot
from sqlglot import exp
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.adapters import llm
from app.ai.counselor import counselor_registry
from app.ai.tools.registry import ToolSpec
from app.core.database import engine as db_engine
from app.models.emotion import Emotion
from app.models.session import ChatSession
from app.models.user import User

# SQL Agent 白名单(咨询师可查,含 users 以 join 学生姓名)
ALLOWED_TABLES = {"emotions", "journals", "sessions", "users"}
MAX_ROWS = 100

SQL_SCHEMA_HINT = (
    "可用表结构与列名(必须使用这些确切列名,不要臆造):\n"
    "- emotions(id, user_id, journal_id, session_id, category, intensity, stress_source, support_need, created_at)\n"
    "- journals(id, user_id, session_id, summary, content, mood_score, created_at)\n"
    "- sessions(id, user_id, title, summary, started_at, risk_level, status)\n"
    "- users(id, role, username, name, created_at)\n"
    "emotions.category 取值: anxious/sad/angry/lonely/tired/calm/hopeful。"
)

SQL_GEN_PROMPT = (
    "你是 SQL 生成器。把咨询师关于学生情绪/日记/会话统计的问题转成一条 PostgreSQL SELECT 语句。\n"
    + SQL_SCHEMA_HINT
    + "\n只允许查询上述表;可 JOIN 取学生姓名;只输出 SQL 本身,不要分号、不要注释、不要解释。"
)

EXPLAIN_PROMPT = "你是数据分析助手。把下面的查询结果用简洁、专业的中文解释给咨询师(3 句话以内)。"


def _generate_sql(question: str) -> str:
    return llm.complete_text(SQL_GEN_PROMPT, question, temperature=0).strip()


def _validate(sql: str) -> exp.Select:
    """AST 校验:单语句 + SELECT + 表白名单;不合法抛 ValueError。"""
    try:
        statements = sqlglot.parse(sql, read="postgres")
    except Exception as exc:  # noqa: BLE001
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


def _jsonable(value):
    """SQL 结果转 JSON 可序列化:Decimal→float、日期→ISO 字符串。"""
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def _execute_readonly(tree: exp.Select) -> tuple[list[str], list[dict]]:
    clean_sql = tree.limit(MAX_ROWS).sql(dialect="postgres")
    with db_engine.connect() as conn:
        conn.execute(text("SET TRANSACTION READ ONLY"))
        result = conn.execute(text(clean_sql))
        headers = list(result.keys())  # 列定义(即使 0 行也可得)
        rows = [dict(zip(headers, (_jsonable(v) for v in row))) for row in result.fetchall()]
    return headers, rows


def _query_student_stats(db: Session, user_id: int, session_id: int, question: str, **kwargs) -> dict:
    """SQL Agent:自然语言 → 只读 SQL → 表格结果(headers/rows)+ 解释。"""
    sql = _generate_sql(question)
    tree = _validate(sql)
    headers, rows = _execute_readonly(tree)
    explanation = llm.complete_text(EXPLAIN_PROMPT, f"问题:{question}\n结果:{rows}", temperature=0.3).strip()
    return {
        "type": "stats_table",
        "sql": sql,
        "headers": headers,
        "rows": rows,
        "row_count": len(rows),
        "explanation": explanation,
    }


def _search_student_journals(db: Session, user_id: int, session_id: int, student: str, **kwargs) -> dict:
    """按学生(姓名/用户名关键词)查最近情绪日记。"""
    pattern = f"%{student.strip()}%"
    user_ids = [
        uid
        for (uid,) in db.query(User.id)
        .filter(User.name.ilike(pattern) | User.username.ilike(pattern))
        .limit(10)
        .all()
    ]
    if not user_ids:
        return {"type": "student_journals", "student": student, "count": 0, "entries": []}
    rows = (
        db.query(Emotion)
        .filter(Emotion.user_id.in_(user_ids))
        .order_by(Emotion.id.desc())
        .limit(20)
        .all()
    )
    entries = [
        {
            "student_id": e.user_id,
            "category": e.category,
            "intensity": e.intensity,
            "stress_source": e.stress_source,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in rows
    ]
    return {"type": "student_journals", "student": student, "count": len(entries), "entries": entries}


def _find_at_risk_students(db: Session, user_id: int, session_id: int, days: int = 14, **kwargs) -> dict:
    """识别情绪异常学生:最近 N 天内高强度负面情绪 或 存在高风险会话。"""
    from datetime import datetime, timedelta

    neg = {"anxious", "sad", "angry", "lonely"}
    cutoff = datetime.now() - timedelta(days=max(1, int(days)))

    hot_emotions = (
        db.query(Emotion)
        .filter(
            Emotion.created_at >= cutoff,
            Emotion.category.in_(neg),
            Emotion.intensity >= 7,
        )
        .order_by(Emotion.id.desc())
        .all()
    )
    by_user: dict[int, dict] = {}
    for e in hot_emotions:
        row = by_user.setdefault(e.user_id, {"hot_count": 0, "latest": e, "high_sessions": 0})
        row["hot_count"] += 1
        if e.id > row["latest"].id:
            row["latest"] = e

    high_sessions = db.query(ChatSession).filter(ChatSession.risk_level == "high").all()
    for s in high_sessions:
        row = by_user.setdefault(s.user_id, {"hot_count": 0, "latest": None, "high_sessions": 0})
        row["high_sessions"] += 1

    students = []
    for uid, row in by_user.items():
        u = db.get(User, uid)
        latest = row["latest"]
        students.append(
            {
                "student_id": uid,
                "name": u.name if u else f"用户{uid}",
                "hot_emotion_count": row["hot_count"],
                "latest_emotion": f"{latest.category}/{latest.intensity}" if latest else None,
                "high_risk_sessions": row["high_sessions"],
            }
        )
    students.sort(key=lambda x: (-x["hot_emotion_count"], -x["high_risk_sessions"]))
    return {"type": "at_risk_students", "days": days, "count": len(students), "students": students[:20]}


counselor_registry.register(
    ToolSpec(
        name="query_student_stats",
        description=(
            "咨询师想了解学生情绪统计/趋势/分布/会话数据时调用:把自然语言问题转成只读 SQL 查询,"
            "返回表格结果(headers/rows)与解释。可指定学生姓名或查询全体。"
        ),
        parameters={
            "type": "object",
            "properties": {"question": {"type": "string", "description": "关于学生情绪/日记/会话的自然语言统计问题"}},
            "required": ["question"],
        },
        handler=_query_student_stats,
    )
)

counselor_registry.register(
    ToolSpec(
        name="search_student_journals",
        description=(
            "咨询师要查看某学生的情绪日记/情绪记录时调用:按学生姓名或用户名检索最近记录,返回条目列表。"
        ),
        parameters={
            "type": "object",
            "properties": {"student": {"type": "string", "description": "学生姓名或用户名关键词"}},
            "required": ["student"],
        },
        handler=_search_student_journals,
    )
)

counselor_registry.register(
    ToolSpec(
        name="find_at_risk_students",
        description=(
            "咨询师想排查情绪异常/需要关注的学生时调用:识别最近 N 天内高强度负面情绪或存在高风险会话的学生。"
            "参数 days 为排查天数(默认 14)。"
        ),
        parameters={
            "type": "object",
            "properties": {"days": {"type": "integer", "description": "排查天数(默认 14)"}},
            "required": [],
        },
        handler=_find_at_risk_students,
    )
)
