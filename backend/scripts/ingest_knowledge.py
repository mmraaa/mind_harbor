"""知识库批量入库:读取 data/knowledge/*.md 全部入库(Milvus 向量 + PostgreSQL 元数据)。

用法(working dir: backend/):
    python scripts/ingest_knowledge.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.ai.rag.ingest import ingest_document

KNOWLEDGE_DIR = Path(__file__).resolve().parent.parent / "data" / "knowledge"


def main() -> None:
    files = sorted(KNOWLEDGE_DIR.glob("*.md"))
    if not files:
        print(f"[warn] {KNOWLEDGE_DIR} 下没有 .md 文件,跳过")
        return

    total = 0
    for f in files:
        n = ingest_document(f)
        print(f"[+] {f.name}: {n} chunks")
        total += n
    print(f"[ok] 入库完成,共 {total} chunks")


if __name__ == "__main__":
    main()
