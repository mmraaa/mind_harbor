"""知识分块:按段落 + 固定窗口切块。

规则:
- 以空行分隔的段落为最小语义单元;
- 短段落累积到 `max_chars` 封块(块间以换行连接);
- 单个段落超过 `max_chars` 时,按固定窗口(带 overlap)切分,不丢内容。
"""

import re

DEFAULT_MAX_CHARS = 500
DEFAULT_OVERLAP = 50


def chunk_text(text: str, max_chars: int = DEFAULT_MAX_CHARS, overlap: int = DEFAULT_OVERLAP) -> list[str]:
    """把文档文本切成知识块,空文本返回空列表(不编造块)。"""
    if not text or not text.strip():
        return []

    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks: list[str] = []
    current = ""

    for para in paragraphs:
        if len(para) > max_chars:
            if current:
                chunks.append(current)
                current = ""
            chunks.extend(_window_split(para, max_chars, overlap))
            continue
        if current and len(current) + 1 + len(para) > max_chars:
            chunks.append(current)
            current = para
        else:
            current = f"{current}\n{para}" if current else para

    if current:
        chunks.append(current)
    return chunks


def _window_split(text: str, max_chars: int, overlap: int) -> list[str]:
    """固定窗口切分:窗口 `max_chars`,步长 `max_chars - overlap`,末尾截断保留。"""
    step = max(1, max_chars - overlap)
    return [piece for i in range(0, len(text), step) if (piece := text[i : i + max_chars]).strip()]
