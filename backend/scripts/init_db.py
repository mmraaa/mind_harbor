"""建表脚本。

用法(working dir: backend/):
    python scripts/init_db.py

行为:
1. 尝试启用 pgvector 扩展(已安装则启用,未安装则跳过并提示)。
2. 创建全部表;若 vector 扩展缺失,跳过 knowledge_docs/knowledge_chunks,
   安装 pgvector 后重跑本脚本即可补齐。
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text

import app.models  # noqa: F401  确保模型注册到 Base.metadata
from app.core.database import Base, engine

VECTOR_TABLES = {"knowledge_docs", "knowledge_chunks"}


def vector_available() -> bool:
    with engine.connect() as conn:
        return conn.execute(text("SELECT 1 FROM pg_extension WHERE extname='vector'")).fetchone() is not None


def main() -> None:
    with engine.connect() as conn:
        try:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            conn.commit()
            print("[ok] pgvector 扩展已启用")
        except Exception as e:  # noqa: BLE001
            print(f"[warn] pgvector 扩展不可用: {e}")

    if vector_available():
        Base.metadata.create_all(engine)
        print("[ok] 全部表已创建")
    else:
        tables = [t for t in Base.metadata.sorted_tables if t.name not in VECTOR_TABLES]
        Base.metadata.create_all(engine, tables=tables)
        print(
            "[warn] vector 扩展缺失,已跳过 knowledge_docs/knowledge_chunks;\n"
            "       请在宿主 PostgreSQL 安装 pgvector(Windows 版)并重启服务后重跑本脚本。"
        )


if __name__ == "__main__":
    main()
