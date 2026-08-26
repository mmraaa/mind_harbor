"""建表脚本(业务数据表;向量存 Milvus,无需此处建)。

用法(working dir: backend/):
    python scripts/init_db.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import inspect, text

import app.models  # noqa: F401  确保模型注册到 Base.metadata
from app.core.database import Base, engine
from app.core.schema import ensure_user_account_schema


_MEMORY_LIFECYCLE_COLUMNS = {
    "confidence": "DOUBLE PRECISION NOT NULL DEFAULT 0.5",
    "status": "VARCHAR(16) NOT NULL DEFAULT 'active'",
    "user_confirmed": "BOOLEAN NOT NULL DEFAULT FALSE",
    "source_session_id": "INTEGER",
    "source_message_id": "INTEGER",
    "evidence_count": "INTEGER NOT NULL DEFAULT 1",
    "last_seen_at": "TIMESTAMP WITH TIME ZONE",
    "expires_at": "TIMESTAMP WITH TIME ZONE",
    "is_sensitive": "BOOLEAN NOT NULL DEFAULT FALSE",
}

def _migrate_legacy_memory_system_rows(bind) -> None:
    """把旧版以特殊记忆行保存的开关和摘要迁入专用设置表。"""
    with bind.begin() as connection:
        rows = connection.execute(
            text(
                """
                SELECT id, user_id, memory_type, content, source, updated_at
                FROM user_memories
                WHERE memory_type IN ('_memory_settings', '_memory_summary', 'summary')
                   OR source IN ('_memory_settings', '_memory_summary', 'memory_summary')
                ORDER BY id
                """
            )
        ).mappings().all()
        by_user: dict[int, dict[str, object]] = {}
        for row in rows:
            state = by_user.setdefault(
                row["user_id"],
                {"enabled": True, "summary": "", "summary_updated_at": None},
            )
            if row["memory_type"] == "_memory_settings" or row["source"] == "_memory_settings":
                state["enabled"] = row["content"] != "disabled"
            elif row["source"] != "_memory_deleted":
                state["summary"] = row["content"] or ""
                state["summary_updated_at"] = row["updated_at"]
        for user_id, state in by_user.items():
            connection.execute(
                text(
                    """
                    INSERT INTO user_memory_settings (user_id, enabled, summary, summary_updated_at)
                    VALUES (:user_id, :enabled, :summary, :summary_updated_at)
                    ON CONFLICT (user_id) DO UPDATE SET
                        enabled = EXCLUDED.enabled,
                        summary = CASE
                            WHEN EXCLUDED.summary <> '' THEN EXCLUDED.summary
                            ELSE user_memory_settings.summary
                        END,
                        summary_updated_at = COALESCE(EXCLUDED.summary_updated_at, user_memory_settings.summary_updated_at)
                    """
                ),
                {"user_id": user_id, **state},
            )
        if rows:
            connection.execute(
                text(
                    """
                    DELETE FROM user_memories
                    WHERE memory_type IN ('_memory_settings', '_memory_summary', 'summary')
                       OR source IN ('_memory_settings', '_memory_summary', 'memory_summary')
                    """
                )
            )


def ensure_schema_compatibility(bind) -> None:
    """给已经存在的业务表补充模型新增字段。

    SQLAlchemy ``create_all`` 只负责建表，不会修改既有表结构。画像功能
    在本机库中可能已经存在旧版画像或记忆表，因此初始化时对新增字段做幂等补列。
    """
    # ``create_all`` 不会升级旧表；这里还需支持已运行服务的增量迁移。
    Base.metadata.tables["user_memory_settings"].create(bind, checkfirst=True)
    Base.metadata.tables["user_profile_analysis_runs"].create(bind, checkfirst=True)

    tables = set(inspect(bind).get_table_names())
    statements: list[str] = []
    if "user_profile_settings" in tables:
        existing = {column["name"] for column in inspect(bind).get_columns("user_profile_settings")}
        for column in sorted({"last_self_edit_at", "last_manual_edit_at"} - existing):
            statements.append(
                f'ALTER TABLE user_profile_settings ADD COLUMN IF NOT EXISTS "{column}" TIMESTAMP WITH TIME ZONE'
            )

    if "user_memories" in tables:
        existing = {column["name"] for column in inspect(bind).get_columns("user_memories")}
        for column, definition in _MEMORY_LIFECYCLE_COLUMNS.items():
            if column not in existing:
                statements.append(
                    f'ALTER TABLE user_memories ADD COLUMN IF NOT EXISTS "{column}" {definition}'
                )

    if "sessions" in tables:
        existing = {column["name"] for column in inspect(bind).get_columns("sessions")}
        if "hidden_from_student_at" not in existing:
            statements.append(
                'ALTER TABLE sessions ADD COLUMN IF NOT EXISTS '
                '"hidden_from_student_at" TIMESTAMP WITH TIME ZONE'
            )

    if statements:
        with bind.begin() as connection:
            for statement in statements:
                connection.execute(text(statement))

    ensure_user_account_schema(bind)

    if "user_memories" in tables:
        _migrate_legacy_memory_system_rows(bind)
        with bind.begin() as connection:
            # “目标与计划”已合并为持续背景；自动记忆不保留会过期的相对日期。
            connection.execute(
                text("UPDATE user_memories SET memory_type = 'context' WHERE memory_type = 'goal'")
            )
            connection.execute(
                text(
                    """
                    UPDATE user_memories
                    SET content = REPLACE(content, '今天考试挂科', '最近考试挂科')
                    WHERE source = 'chat_auto' AND content LIKE '%今天考试挂科%'
                    """
                )
            )


def main() -> None:
    Base.metadata.create_all(engine)
    ensure_schema_compatibility(engine)
    print("[ok] 全部业务表已创建(向量存 Milvus,见 app/ai/rag/)")


if __name__ == "__main__":
    main()
