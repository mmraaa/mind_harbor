"""Idempotent schema upgrades required by the running application."""

from sqlalchemy import inspect, text


USER_ACCOUNT_COLUMNS = {
    "display_username": "VARCHAR(64)",
    "gender": "VARCHAR(16)",
    "last_username_changed_at": "TIMESTAMP WITH TIME ZONE",
    "last_password_changed_at": "TIMESTAMP WITH TIME ZONE",
}


def ensure_user_account_schema(bind) -> None:
    """Upgrade ``users`` before ORM reads the account fields added after launch."""
    inspector = inspect(bind)
    if "users" not in inspector.get_table_names():
        return

    existing = {column["name"] for column in inspector.get_columns("users")}
    missing = {
        column: definition
        for column, definition in USER_ACCOUNT_COLUMNS.items()
        if column not in existing
    }
    if not missing:
        return

    with bind.begin() as connection:
        for column, definition in missing.items():
            connection.execute(
                text(f'ALTER TABLE users ADD COLUMN IF NOT EXISTS "{column}" {definition}')
            )
        if "display_username" in missing:
            connection.execute(
                text(
                    "UPDATE users "
                    "SET display_username = COALESCE(NULLIF(name, ''), username) "
                    "WHERE display_username IS NULL"
                )
            )
