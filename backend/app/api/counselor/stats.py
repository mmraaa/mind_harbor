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
from app.models.session import ChatSession
from app.models.user import User

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


@router.get("/stats/overview")
def overview(
    days: int = 30,
    user: User = Depends(require_roles("counselor", "admin")),
    db: Session = Depends(get_db),
) -> dict:
    """总览卡片:学生/会话/风险/日记/情绪数 与 平均强度。"""
    cutoff = _cutoff(days)
    emotions = db.query(Emotion).filter(Emotion.created_at >= cutoff).all()
    high_risk_sessions = db.query(ChatSession).filter(ChatSession.risk_level == "high").count()
    return {
        "days": days,
        "students": db.query(User).filter_by(role="student").count(),
        "sessions": db.query(ChatSession).count(),
        "active_sessions": db.query(ChatSession).filter_by(status="active").count(),
        "closed_sessions": db.query(ChatSession).filter_by(status="closed").count(),
        "high_risk_sessions": high_risk_sessions,
        "journals": db.query(Journal).count(),
        "emotions_in_window": len(emotions),
        "avg_intensity": _avg([e.intensity for e in emotions]),
    }


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


@router.get("/stats/emotion-trend")
def emotion_trend(
    days: int = 30,
    student_id: int | None = None,
    user: User = Depends(require_roles("counselor", "admin")),
    db: Session = Depends(get_db),
) -> dict:
    """情绪强度时间趋势(折线):按天聚合 平均强度 / 记录数 / 主情绪。"""
    cutoff = _cutoff(days)
    q = db.query(Emotion).filter(Emotion.created_at >= cutoff)
    if student_id:
        q = q.filter(Emotion.user_id == student_id)
    emotions = q.order_by(Emotion.created_at).all()

    by_day: dict[str, list[Emotion]] = {}
    for e in emotions:
        key = e.created_at.date().isoformat()
        by_day.setdefault(key, []).append(e)

    points = []
    for day, items in sorted(by_day.items()):
        cats = {}
        for e in items:
            cats[e.category] = cats.get(e.category, 0) + 1
        top = max(cats.items(), key=lambda kv: kv[1])[0]
        points.append(
            {
                "date": day,
                "avg_intensity": round(mean(e.intensity for e in items), 1),
                "count": len(items),
                "top_category": top,
            }
        )
    return {"days": days, "student_id": student_id, "points": points}


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
    """学生详情:资料 + 情绪时间序列 + 日记列表 + 近期会话。"""
    u = db.get(User, student_id)
    if u is None:
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
        .limit(20)
        .all()
    )
    sessions = (
        db.query(ChatSession)
        .filter_by(user_id=student_id)
        .order_by(ChatSession.id.desc())
        .limit(20)
        .all()
    )
    return {
        "student": {
            "id": u.id,
            "name": u.name,
            "username": u.username,
            "created_at": _iso(u.created_at),
        },
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
            {"id": j.id, "summary": j.summary, "mood_score": j.mood_score, "created_at": _iso(j.created_at)}
            for j in journals
        ],
        "sessions": [
            {
                "id": s.id,
                "title": s.title,
                "risk_level": s.risk_level,
                "status": s.status,
                "started_at": _iso(s.started_at),
            }
            for s in sessions
        ],
    }


@router.get("/stats/sessions")
def sessions(
    risk: str = "all",  # all / high
    days: int = 30,
    user: User = Depends(require_roles("counselor", "admin")),
    db: Session = Depends(get_db),
) -> dict:
    """会话列表(可按风险过滤):含学生信息与消息数。"""
    cutoff = _cutoff(days)
    q = (
        db.query(ChatSession, User.name, User.username)
        .join(User, ChatSession.user_id == User.id)
        .filter(ChatSession.started_at >= cutoff)
    )
    if risk == "high":
        q = q.filter(ChatSession.risk_level == "high")
    rows = q.order_by(ChatSession.id.desc()).limit(100).all()

    from app.models.session import Message

    out = []
    for s, name, username in rows:
        msg_count = db.query(func.count(Message.id)).filter_by(session_id=s.id).scalar()
        out.append(
            {
                "id": s.id,
                "student_id": s.user_id,
                "student_name": name,
                "student_username": username,
                "title": s.title,
                "risk_level": s.risk_level,
                "status": s.status,
                "started_at": _iso(s.started_at),
                "message_count": msg_count,
            }
        )
    return {"count": len(out), "sessions": out}
