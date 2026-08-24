"""把 LLM 回复洗成 CosyVoice 可朗读的纯文本。

屏幕仍展示原始 Markdown;仅 TTS 走这里。表格分隔行 / 纯符号 / 表情
会导致百炼 400(invalid text) 或 415,应得到空串并由调用方跳过合成。
"""

from __future__ import annotations

import re
import unicodedata

_MD_IMAGE_RE = re.compile(r"!\[([^\]]*)\]\([^)]+\)")
_MD_LINK_RE = re.compile(r"\[([^\]]+)\]\([^)]+\)")
_MD_HEADING_RE = re.compile(r"^#{1,6}\s+", re.M)
_MD_FENCE_RE = re.compile(r"```+")
_MD_MARK_RE = re.compile(r"[*_~`]+")
_DECORATION_RE = re.compile(r"^[\s|:\-*_~`#]+$")
_WORD_RE = re.compile(r"[\u4e00-\u9fffA-Za-z0-9]")
_SPACE_BEFORE_PUNCT_RE = re.compile(r"\s+([。！？!?，,、；;：:])")

_EXTRA_SYMBOLS = set("✨⭐🌟💡🔥❤️♥♪♫※■□●○◆◇▶►•·")


def _keep_char(ch: str) -> bool:
    cat = unicodedata.category(ch)
    if cat in {"So", "Sk", "Cs", "Cf", "Mn"}:
        return False
    if ord(ch) in {0xFE0F, 0x200D, 0x200B}:
        return False
    if ch in _EXTRA_SYMBOLS:
        return False
    return True


def _is_table_separator(raw: str) -> bool:
    if raw.count("|") < 2 and "---" not in raw:
        return False
    return (not _WORD_RE.search(raw)) and ("-" in raw or raw.count("|") >= 2)


def to_speakable(text: str) -> str:
    """去掉 Markdown / 表情后的朗读稿;无可读内容时返回空串。"""
    if not text or not str(text).strip():
        return ""
    raw = str(text).replace("\r\n", "\n").strip()
    if _is_table_separator(raw) or _DECORATION_RE.match(raw):
        return ""
    if raw.count("|") >= 2:
        cells = [c.strip() for c in raw.strip("|").split("|")]
        cells = [c for c in cells if c and not re.fullmatch(r":?-{3,}:?", c)]
        raw = "，".join(cells)
    raw = _MD_IMAGE_RE.sub(r"\1", raw)
    raw = _MD_LINK_RE.sub(r"\1", raw)
    raw = _MD_HEADING_RE.sub("", raw)
    raw = _MD_FENCE_RE.sub("", raw)
    raw = raw.replace("**", "").replace("__", "")
    raw = _MD_MARK_RE.sub("", raw)
    raw = "".join(ch for ch in raw if _keep_char(ch))
    raw = re.sub(r"\s+", " ", raw)
    raw = _SPACE_BEFORE_PUNCT_RE.sub(r"\1", raw)
    raw = raw.strip(" \t|*-_~`#")
    if not _WORD_RE.search(raw):
        return ""
    return raw
