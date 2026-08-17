"""知识库批量入库:按 ## 二级标题切分 → 清空旧库 → 重新向量化入库。

用法(working dir: backend/):
    python scripts/ingest_knowledge.py
    python scripts/ingest_knowledge.py --no-purge   # 不清库,仅覆盖同名文档
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.ai.rag.chunking import chunk_document
from app.ai.rag.ingest import ingest_document, purge_all_knowledge
from app.ai.rag.milvus import MilvusStore
from app.core.database import SessionLocal

KNOWLEDGE_DIR = Path(__file__).resolve().parent.parent / "data" / "knowledge"


def main() -> None:
    parser = argparse.ArgumentParser(description="知识库 markdown 入库(按 ## 切分)")
    parser.add_argument(
        "--no-purge",
        action="store_true",
        help="跳过全库清空;仅覆盖同名 source 文档",
    )
    args = parser.parse_args()

    files = sorted(KNOWLEDGE_DIR.glob("*.md"))
    if not files:
        print(f"[warn] {KNOWLEDGE_DIR} 下没有 .md 文件,跳过")
        return

    store = MilvusStore()
    store.ensure_collection()
    session = SessionLocal()
    try:
        if not args.no_purge:
            doc_n, vec_n = purge_all_knowledge(db=session, store=store)
            print(f"[purge] 已清空旧库: {doc_n} 篇文档, {vec_n} 条向量")

        total = 0
        preview_chunks = 0
        for f in files:
            text = f.read_text(encoding="utf-8")
            n_sections = len(chunk_document(text))
            n = ingest_document(f, db=session, store=store)
            print(f"[+] {f.name}: {n} chunks (## 节 {n_sections})")
            total += n
            preview_chunks += n_sections

        print(f"[ok] 入库完成,共 {total} 子块向量 ({len(files)} 篇文档)")
    finally:
        session.close()


if __name__ == "__main__":
    main()
