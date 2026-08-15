"""建表脚本(业务数据表;向量存 Milvus,无需此处建)。

用法(working dir: backend/):
    python scripts/init_db.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import app.models  # noqa: F401  确保模型注册到 Base.metadata
from app.core.database import Base, engine


def main() -> None:
    Base.metadata.create_all(engine)
    print("[ok] 全部业务表已创建(向量存 Milvus,见 app/ai/rag/)")


if __name__ == "__main__":
    main()
