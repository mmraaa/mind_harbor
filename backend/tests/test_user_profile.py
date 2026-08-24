"""画像问卷完成后应立即生成分析文案,而不是等待 3 段会话。"""

from app.services.user_profile import PROFILE_QUESTIONS, _rich_sections, score_big_five


def _answers(value: str = "3") -> dict[str, str]:
    return {question["id"]: value for question in PROFILE_QUESTIONS}


def test_rich_sections_after_questionnaire_are_not_placeholders():
    big_five = score_big_five(_answers("4"))
    sections = _rich_sections(big_five, evidence_count=0)
    assert "暂不判断" not in "".join(sections.values())
    assert "等待至少 3 段" not in sections["overall_analysis"]
    assert sections["thinking_decision"]
    assert sections["learning_style"]
    assert sections["strengths_blind_spots"]
    assert sections["interests"]
    assert sections["career_directions"]
    assert sections["work_environment"]
    assert sections["growth_focus"]
    assert "开放性" in sections["overall_analysis"]


def test_rich_sections_can_append_conversation_evidence():
    big_five = score_big_five(_answers("3"))
    sections = _rich_sections(
        big_five,
        evidence_count=3,
        observations=[{"status": "stable", "value": "先被倾听"}],
    )
    assert "先被倾听" in sections["overall_analysis"]
