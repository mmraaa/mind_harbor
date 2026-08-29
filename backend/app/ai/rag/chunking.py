"""知识分块:按 markdown 二级标题(##)切分 + Small-to-Big 父子结构。

方案:
1. 每个 `## 节标题` 及其下属内容(含 ### 等更深层级)作为一个语义单元(父块);
2. 子块注入 `[文档标题 > 节标题]` 前缀供向量检索;
3. 无 `##` 的文档:整篇正文(去掉一级标题)作为单节 fallback。
"""

import re
from dataclasses import dataclass

DEFAULT_MAX_CHARS = 600
DEFAULT_OVERLAP = 50


@dataclass
class SemanticChunk:
    """一个可向量化的子块。"""

    content: str            # 子块(向量化用),带 [文档 > 节] 前缀
    section: str
    parent_content: str     # 父块(整节全文,仅供 LLM 回查,不向量化)
    seq: int


def chunk_text(text: str, max_chars: int = DEFAULT_MAX_CHARS, overlap: int = DEFAULT_OVERLAP) -> list[str]:
    """旧版窗口分块(保留兼容):段落累积 + 固定窗口,空文本返回空列表。"""
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


def chunk_document(text: str, max_chars: int = DEFAULT_MAX_CHARS, overlap: int = DEFAULT_OVERLAP) -> list[SemanticChunk]:
    """按 `##` 二级标题切分;每节一个子块(整节不向量化窗口二次切分)。"""
    if not text or not text.strip():
        return []

    doc_title, sections = _parse_h2_sections(text)          # `##` 为节边界;`#` 为文档标题
    if not sections:
        body = _body_without_h1(text)
        if not body:
            return []
        fallback_title = doc_title or "文档"
        sections = [(fallback_title, body.splitlines())]

    result: list[SemanticChunk] = []
    for section_title, body_lines in sections:
        parent_content = "\n".join(body_lines).strip()       # 父块:整节文本
        if not parent_content:
            continue
        path = " > ".join(filter(None, [doc_title, section_title]))
        full = f"[{path}]\n{parent_content}"                # 子块:带层级前缀
        if len(full) > max_chars:                           # 超长节再按窗口切
            for piece in _window_split(full, max_chars, overlap):
                result.append(
                    SemanticChunk(content=piece, section=section_title, parent_content=parent_content, seq=len(result))
                )
        else:
            result.append(
                SemanticChunk(content=full, section=section_title, parent_content=parent_content, seq=len(result))
            )
    return result


def _body_without_h1(text: str) -> str:
    lines: list[str] = []
    skipped_h1 = False
    for line in text.splitlines():
        if not skipped_h1 and re.match(r"^#\s+(.+)$", line.strip()) and not re.match(r"^##\s+", line.strip()):
            skipped_h1 = True
            continue
        lines.append(line)
    return "\n".join(lines).strip()


def _parse_h2_sections(text: str) -> tuple[str | None, list[tuple[str, list[str]]]]:
    """按 `##` 切分 → (文档标题, [(节标题, 正文行), ...])。

    - `#` 一级标题 → 文档标题;
    - `##` → 新节边界(### 及以下保留在节内);
    - 首个 `##` 前的正文并入第一节(若存在)。
    """
    doc_title: str | None = None
    sections: list[tuple[str, list[str]]] = []
    preamble: list[str] = []
    current_title: str | None = None
    current_lines: list[str] = []
    seen_h2 = False

    def flush() -> None:
        nonlocal current_title, current_lines
        if current_title is None:
            if current_lines:
                preamble.extend(current_lines)
            current_lines = []
            return
        sections.append((current_title, list(current_lines)))
        current_lines = []

    for line in text.splitlines():
        h1 = re.match(r"^#\s+(.+)$", line.strip())
        h2 = re.match(r"^##\s+(.+)$", line.strip())
        if h1 and not h2:
            flush()
            doc_title = h1.group(1).strip()
            current_title = None
            current_lines = []
            continue
        if h2:
            flush()
            seen_h2 = True
            current_title = h2.group(1).strip()
            current_lines = []
            continue
        if current_title is None:
            preamble.append(line)
        else:
            current_lines.append(line)

    flush()

    if preamble and sections:
        first_title, first_lines = sections[0]
        sections[0] = (first_title, preamble + first_lines)
    elif preamble and not sections and not seen_h2:
        return doc_title, []

    return doc_title, sections


def _window_split(text: str, max_chars: int, overlap: int) -> list[str]:
    """固定窗口切分:窗口 `max_chars`,步长 `max_chars - overlap`,末尾截断保留。"""
    step = max(1, max_chars - overlap)
    return [piece for i in range(0, len(text), step) if (piece := text[i : i + max_chars]).strip()]
