"""情绪识别 + 风险筛查测试:多轮上下文对短回复判断的影响。

约定:LLM 一律 monkeypatch(app.adapters.llm.complete_json),零真实 API。
"""

from app.ai import emotion
from app.adapters import llm as llm_mod


def _capture_and_respond(responder):
    """monkeypatch complete_json:捕获 user prompt,返回 responder(user)。"""

    def wrapper(monkeypatch, responder):
        captured = {}

        def fake(system, user, **kw):
            captured["system"] = system
            captured["user"] = user
            return responder(user)

        monkeypatch.setattr(llm_mod, "complete_json", fake)
        return captured

    return wrapper


def test_analyze_passes_history_and_summary_to_llm(monkeypatch):
    """多轮上下文:history 与 summary 应拼进传给 LLM 的 user 文本。"""
    captured = {}
    monkeypatch.setattr(
        llm_mod,
        "complete_json",
        lambda system, user, **kw: (captured.update(user=user, system=system), {"category": "calm", "intensity": 3})[1],
    )

    emotion.analyze(
        "嗯",
        history=[("user", "我最近特别焦虑,睡不着"), ("assistant", "我理解,能和我说说吗?")],
        summary="用户近期因考试失眠而焦虑",
    )

    assert "会话摘要:用户近期因考试失眠而焦虑" in captured["user"]
    assert "我最近特别焦虑" in captured["user"]
    assert "当前消息:嗯" in captured["user"]


def test_analyze_short_reply_uses_context_for_emotion(monkeypatch):
    """短回复结合上下文:LLM 依据历史返回悲伤/风险,识别结果被采纳。"""

    def fake(user, **kw):
        # 模拟 LLM 看到历史"想结束一切"后,对当前"嗯"判定为风险
        if "结束一切" in user:
            return {"category": "sad", "intensity": 9, "is_risk": True, "risk_reason": "结合上下文的自伤意图"}
        return {"category": "calm", "intensity": 2}

    monkeypatch.setattr(llm_mod, "complete_json", lambda system, user, **kw: fake(user))

    result = emotion.analyze(
        "嗯",
        history=[("user", "我真的不想活了,想结束一切"), ("assistant", "我听到你的痛苦,我们一起找帮助")],
    )
    assert result.is_risk is True
    assert result.risk_reason  # 携带风险原因


def test_analyze_risk_keyword_fast_path_skips_llm(monkeypatch):
    """危机关键词快速通道:命中即返回风险,不调用 LLM。"""
    called = False

    def fake(system, user, **kw):
        nonlocal called
        called = True
        return {"category": "calm", "intensity": 1}

    monkeypatch.setattr(llm_mod, "complete_json", fake)
    result = emotion.analyze("我不想活了")

    assert result.is_risk is True
    assert "想活" in (result.risk_reason or "")
    assert called is False  # 未调 LLM


def test_analyze_without_context_still_works(monkeypatch):
    """无上下文(向后兼容):user 文本即当前消息。"""
    captured = {}
    monkeypatch.setattr(
        llm_mod,
        "complete_json",
        lambda system, user, **kw: (captured.update(user=user), {"category": "tired", "intensity": 5})[1],
    )

    result = emotion.analyze("我今天很累")

    assert captured["user"] == "当前消息:我今天很累"
    assert result.category == "tired"
