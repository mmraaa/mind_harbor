"""朗读文本清洗:Markdown / 表情 / 表格分隔行不能进 CosyVoice。"""

from app.ai.speakable import to_speakable


def test_strips_emoji_keeps_chinese():
    # 😊 = U+1F60A,避免源文件编码差异
    raw = "今天心情不好 " + "\U0001F60A" + "。"
    assert to_speakable(raw) == "今天心情不好。"


def test_strips_markdown_emphasis():
    assert to_speakable("**别担心**，慢慢来。") == "别担心，慢慢来。"


def test_table_separator_is_unspeakable():
    assert to_speakable("| --- | --- |") == ""
    assert to_speakable("|:---|---:|") == ""


def test_table_row_becomes_spoken_list():
    spoken = to_speakable("| 日期 | 内容 | 情绪 |")
    assert "|" not in spoken
    assert "日期" in spoken and "内容" in spoken and "情绪" in spoken


def test_link_keeps_anchor_text():
    assert to_speakable("见[热线](https://example.com)。") == "见热线。"


def test_punctuation_only_is_empty():
    assert to_speakable("***") == ""
    assert to_speakable("  ") == ""


def test_heading_and_code_fence():
    assert to_speakable("## 小结") == "小结"
    assert to_speakable("试着`深呼吸`") == "试着深呼吸"


def test_tts_chunk_skips_table_separator_without_calling_vendor(monkeypatch):
    from app.ai import dialogue

    called = {"n": 0}

    def boom(text, **kw):
        called["n"] += 1
        raise AssertionError("不应请求 TTS")

    monkeypatch.setattr(dialogue.tts, "synthesize", boom)
    assert dialogue._tts_chunk(1, 0, "| --- | --- |") is None
    assert called["n"] == 0


def test_tts_chunk_sends_cleaned_text(monkeypatch):
    from app.ai import dialogue

    seen: list[str] = []

    def fake(text, **kw):
        seen.append(text)
        return b"MP3"

    monkeypatch.setattr(dialogue.tts, "synthesize", fake)
    payload = dialogue._tts_chunk(1, 0, "**别担心**")
    assert payload is not None
    assert payload["text"] == "别担心"
    assert seen == ["别担心"]
