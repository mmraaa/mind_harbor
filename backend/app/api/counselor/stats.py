"""咨询师端多维度数据查询接口(结构化数据,供前端 ECharts/表格直接渲染)。

权限:仅 counselor / admin。只读聚合查询(不用 LLM),响应字段稳定。
"""

from datetime import date, datetime, timedelta
from decimal import Decimal
from statistics import mean

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.database import get_db
from app.models.emotion import EMOTION_CATEGORIES, Emotion
from app.models.emotion import Journal
from app.models.session import ChatSession, Message
from app.models.user import ROLE_STUDENT, User

router = APIRouter(prefix="/counselor", tags=["counselor"])

NEGATIVE = {"anxious", "sad", "angry", "lonely"}


def _iso(value) -> str | None:
    return value.isoformat() if isinstance(value, (datetime, date)) else value


def _num(value) -> float | int:
    return float(value) if isinstance(value, Decimal) else value


def _cutoff(days: int) -> datetime:
    return datetime.now() - timedelta(days=max(1, min(int(days), 365)))


def _avg(values: list) -> float | None:
    return round(mean(values), 1) if values else None


def _emotion_trend(emotions: list[Emotion], days: int) -> list[dict]:
    """按日聚合平均强度,补齐窗口内每一天(无记录则为 null)。"""
    by_day: dict[str, list[Emotion]] = {}
    for e in emotions:
        if e.created_at is None:
            continue
        by_day.setdefault(e.created_at.date().isoformat(), []).append(e)

    points: list[dict] = []
    start = (datetime.now() - timedelta(days=max(1, days) - 1)).date()
    end = datetime.now().date()
    cur = start
    while cur <= end:
        key = cur.isoformat()
        items = by_day.get(key, [])
        if items:
            cats: dict[str, int] = {}
            for e in items:
                cats[e.category] = cats.get(e.category, 0) + 1
            top = max(cats.items(), key=lambda kv: kv[1])[0]
            points.append(
                {
                    "date": key,
                    "avg_intensity": round(mean(e.intensity for e in items), 1),
                    "count": len(items),
                    "top_category": top,
                }
            )
        else:
            points.append({"date": key, "avg_intensity": None, "count": 0, "top_category": None})
        cur += timedelta(days=1)
    return points


@router.get("/stats/emotion-distribution")
def emotion_distribution(
    days: int = 30,
    student_id: int | None = None,
    user: User = Depends(require_roles("counselor", "admin")),
    db: Session = Depends(get_db),
) -> dict:
    """情绪类别分布(饼图):按 category 计数。可选限定单个学生。"""
    cutoff = _cutoff(days)
    q = db.query(Emotion.category, func.count(Emotion.id)).filter(Emotion.created_at >= cutoff)
    if student_id:
        q = q.filter(Emotion.user_id == student_id)
    rows = q.group_by(Emotion.category).all()
    total = sum(c for _, c in rows) or 1
    distribution = [
        {"category": cat, "count": cnt, "pct": round(cnt / total * 100, 1)}
        for cat, cnt in rows
    ]
    # 补全未出现的类别(前端展示固定枚举)
    seen = {r["category"] for r in distribution}
    for cat in EMOTION_CATEGORIES:
        if cat not in seen:
            distribution.append({"category": cat, "count": 0, "pct": 0.0})
    return {"days": days, "total": total - (total == 1 and not rows), "distribution": distribution}


@router.get("/stats/students")
def students(
    keyword: str | None = None,
    risk: str = "all",  # all / high / low
    days: int = 30,
    user: User = Depends(require_roles("counselor", "admin")),
    db: Session = Depends(get_db),
) -> dict:
    """学生列表:情绪概况(数量/平均强度/最近情绪)+ 风险会话数。"""
    cutoff = _cutoff(days)
    q = db.query(User).filter(User.role == "student")
    if keyword and keyword.strip():
        p = f"%{keyword.strip()}%"
        q = q.filter(User.name.ilike(p) | User.username.ilike(p))
    students_rows = q.order_by(User.id).all()

    out = []
    for u in students_rows:
        emos = (
            db.query(Emotion)
            .filter(Emotion.user_id == u.id, Emotion.created_at >= cutoff)
            .order_by(Emotion.id.desc())
            .all()
        )
        risk_sessions = (
            db.query(ChatSession).filter_by(user_id=u.id, risk_level="high").count()
        )
        latest = emos[0] if emos else None
        row = {
            "id": u.id,
            "name": u.name,
            "username": u.username,
            "emotion_count": len(emos),
            "avg_intensity": _avg([e.intensity for e in emos]),
            "latest_emotion": latest.category if latest else None,
            "latest_intensity": latest.intensity if latest else None,
            "latest_at": _iso(latest.created_at) if latest else None,
            "high_risk_sessions": risk_sessions,
        }
        if risk == "high" and not (row["high_risk_sessions"] or (row["latest_emotion"] in NEGATIVE and (row["latest_intensity"] or 0) >= 7)):
            continue
        out.append(row)

    return {"count": len(out), "students": out}


@router.get("/stats/students/{student_id}/detail")
def student_detail(
    student_id: int,
    days: int = 30,
    user: User = Depends(require_roles("counselor", "admin")),
    db: Session = Depends(get_db),
) -> dict:
    """学生详情:基本资料 + 档案统计 + 按日情绪趋势 + 日记 + 近期会话索引。"""
    u = db.get(User, student_id)
    if u is None or u.role != ROLE_STUDENT:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "学生不存在")

    cutoff = _cutoff(days)
    emotions = (
        db.query(Emotion)
        .filter(Emotion.user_id == student_id, Emotion.created_at >= cutoff)
        .order_by(Emotion.created_at)
        .all()
    )
    journals = (
        db.query(Journal)
        .filter_by(user_id=student_id)
        .order_by(Journal.id.desc())
        .all()
    )
    journal_ids = [j.id for j in journals]
    journal_emotions = (
        db.query(Emotion).filter(Emotion.journal_id.in_(journal_ids)).all() if journal_ids else []
    )
    emotion_by_journal = {e.journal_id: e for e in journal_emotions if e.journal_id is not None}
    sessions = (
        db.query(ChatSession)
        .filter_by(user_id=student_id)
        .order_by(ChatSession.id.desc())
        .all()
    )
    latest = emotions[-1] if emotions else None
    session_count = db.query(func.count(ChatSession.id)).filter_by(user_id=student_id).scalar() or 0
    journal_count = db.query(func.count(Journal.id)).filter_by(user_id=student_id).scalar() or 0
    high_risk_sessions = (
        db.query(func.count(ChatSession.id)).filter_by(user_id=student_id, risk_level="high").scalar() or 0
    )
    session_items = []
    for s in sessions:
        msg_count = db.query(func.count(Message.id)).filter_by(session_id=s.id).scalar() or 0
        session_items.append(
            {
                "id": s.id,
                "title": s.title,
                "summary": s.summary,
                "risk_level": s.risk_level,
                "status": s.status,
                "started_at": _iso(s.started_at),
                "message_count": msg_count,
            }
        )
    return {
        "student": {
            "id": u.id,
            "name": u.name,
            "username": u.username,
            "role": u.role,
            "created_at": _iso(u.created_at),
        },
        "profile": {
            "session_count": session_count,
            "journal_count": journal_count,
            "high_risk_sessions": high_risk_sessions,
            "emotion_count": len(emotions),
            "avg_intensity": _avg([e.intensity for e in emotions]),
            "latest_emotion": latest.category if latest else None,
            "latest_intensity": latest.intensity if latest else None,
            "latest_at": _iso(latest.created_at) if latest else None,
        },
        "days": days,
        "emotion_trend": _emotion_trend(emotions, days),
        "emotion_series": [
            {
                "id": e.id,
                "category": e.category,
                "intensity": e.intensity,
                "stress_source": e.stress_source,
                "created_at": _iso(e.created_at),
            }
            for e in emotions
        ],
        "journals": [
            {
                "id": j.id,
                "summary": j.summary,
                "content": j.content,
                "mood_score": j.mood_score,
                "created_at": _iso(j.created_at),
                "session_id": j.session_id,
                "stress_source": emotion_by_journal.get(j.id).stress_source if emotion_by_journal.get(j.id) else None,
                "support_need": emotion_by_journal.get(j.id).support_need if emotion_by_journal.get(j.id) else None,
            }
            for j in journals
        ],
        "sessions": session_items,
    }


@router.get("/stats/sessions/{session_id}/messages")
def session_messages(
    session_id: int,
    user: User = Depends(require_roles("counselor", "admin")),
    db: Session = Depends(get_db),
) -> dict:
    """会话消息回放:该会话全部消息(学生 / 助手)。"""
    session = db.get(ChatSession, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "会话不存在")
    rows = db.query(Message).filter_by(session_id=session_id).order_by(Message.id).all()
    return {
        "session_id": session_id,
        "count": len(rows),
        "messages": [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "emotion_tags": m.emotion_tags,
                "tool_cards": m.tool_cards,
                "created_at": _iso(m.created_at),
            }
            for m in rows
        ],
    }
