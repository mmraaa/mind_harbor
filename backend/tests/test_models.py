from app.models.emotion import EMOTION_CATEGORIES, Emotion, Journal
from app.models.user import User


def test_user_crud(db):
    u = User(role="student", username="m1", name="模型", password_hash="x")
    db.add(u)
    db.commit()
    db.refresh(u)
    assert u.id is not None
    assert db.query(User).filter_by(username="m1").first().name == "模型"


def test_journal_emotion_link(db):
    """情绪记录只在日记生成时一并产出:emotion.journal_id 关联必填。"""
    u = User(role="student", username="m2", name="模型二", password_hash="x")
    db.add(u)
    db.flush()

    j = Journal(user_id=u.id, summary="今日", content="有点焦虑", mood_score=6)
    db.add(j)
    db.flush()

    e = Emotion(
        user_id=u.id,
        journal_id=j.id,
        session_id=None,
        category="anxious",
        intensity=7,
        stress_source="考试",
        support_need="陪伴",
    )
    db.add(e)
    db.commit()

    assert e.journal_id == j.id
    assert e.category in EMOTION_CATEGORIES
    assert db.query(Emotion).filter_by(journal_id=j.id).count() == 1
