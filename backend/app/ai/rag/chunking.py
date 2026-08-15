"""知识分块(Advanced RAG 切片优化):标题层级感知 + 父子分块(Small-to-Big)。

方案:
1. 按 markdown 标题树把文档切成「节」——每个节是一个语义单元(父块);
2. 节内子块注入 `[文档标题 > 节标题]` 上下文前缀,供向量检索(小块精确);
3. 父块(整节文本)不向量化,检索命中子块后回查父块喂给 LLM,上下文更完整。

`chunk_text` 为旧版窗口分块,保留兼容;新入口是 `chunk_document`。
"""

import re
from dataclasses import dataclass

DEFAULT_MAX_CHARS = 600
DEFAULT_OVERLAP = 50


@dataclass
class SemanticChunk:
    """一个可向量化的子块。

    - `content`:子块文本(带 `[文档 > 节]` 上下文前缀),进 Milvus 检索;
    - `section`:所属节标题(去 markdown 标记);
    - `parent_content`:父块(整节)文本,供 Small-to-Big 回查;
    - `seq`:文档内顺序。
    """

    content: str
    section: str
    parent_content: str
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


def chunk_document(
    text: str, max_chars: int = DEFAULT_MAX_CHARS, overlap: int = DEFAULT_OVERLAP
) -> list[SemanticChunk]:
    """标题层级感知的父子分块:返回子块列表,每块含父块文本。"""
    if not text or not text.strip():
        return []
    doc_title, sections = _parse_sections(text)
    result: list[SemanticChunk] = []
    for path, body_lines in sections:
        title = " > ".join(filter(None, path)) or doc_title or "文档"
        parent_content = "\n".join(body_lines).strip()
        if not parent_content:
            continue
        section = path[-1] if len(path) > 1 else (doc_title or "")
        full = f"[{title}]\n{parent_content}"
        if len(full) <= max_chars:
            result.append(SemanticChunk(content=full, section=section, parent_content=parent_content, seq=len(result)))
        else:
            for piece in _window_split(full, max_chars, overlap):
                result.append(SemanticChunk(content=piece, section=section, parent_content=parent_content, seq=len(result)))
    return result


def _parse_sections(text: str) -> tuple[str | None, list[tuple[list[str], list[str]]]]:
    """解析 markdown 标题树 → (文档标题, [(标题路径, 节正文行), ...])。

    标题路径 = [文档标题, ...节标题];节标题层级用栈维护。
    """
    doc_title: str | None = None
    stack: list[tuple[int, str]] = []  # (标题级别, 标题)
    sections: list[tuple[list[str], list[str]]] = []
    current: list[str] = []

    def flush() -> None:
        if current or stack:
            path = [doc_title] + [t for _, t in stack] if doc_title else [t for _, t in stack]
            sections.append((path, list(current)))  # 存副本,避免 clear 误清
            current.clear()

    for line in text.splitlines():
        m = re.match(r"^(#{1,4})\s+(.+)$", line.strip())
        if m:
            level, title = len(m.group(1)), m.group(2).strip()
            if level == 1:
                flush()
                doc_title = title
                stack.clear()
            else:
                flush()
                # 同级/更深级标题:弹出栈顶级别 >= 新级别的项(替换兄弟节点)
                while stack and stack[-1][0] >= level:
                    stack.pop()
                stack.append((level, title))
        else:
            current.append(line)
    flush()
    return doc_title, sections


def _window_split(text: str, max_chars: int, overlap: int) -> list[str]:
    """固定窗口切分:窗口 `max_chars`,步长 `max_chars - overlap`,末尾截断保留。"""
    step = max(1, max_chars - overlap)
    return [piece for i in range(0, len(text), step) if (piece := text[i : i + max_chars]).strip()]
