"""画像每日零点调度器。"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from app.core.database import SessionLocal
from app.services.profile_analysis import run_daily_profile_analysis
from app.services.user_memory import run_daily_memory_consolidation

logger = logging.getLogger(__name__)
BEIJING = timezone(timedelta(hours=8))


def seconds_until_next_midnight(now: datetime | None = None) -> float:
    local_now = (now or datetime.now(BEIJING)).astimezone(BEIJING)
    tomorrow = (local_now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return max(1.0, (tomorrow - local_now).total_seconds())


async def run_daily_loop(stop: asyncio.Event) -> None:
    while not stop.is_set():
        try:
            await asyncio.wait_for(stop.wait(), timeout=seconds_until_next_midnight())
            continue
        except asyncio.TimeoutError:
            pass
        db = SessionLocal()
        try:
            run_daily_profile_analysis(db, today=datetime.now(BEIJING).date())
        except Exception:  # noqa: BLE001
            logger.exception("每日画像分析任务失败")
        try:
            run_daily_memory_consolidation(db)
        except Exception:  # noqa: BLE001
            logger.exception("每日记忆整理任务失败")
        finally:
            db.close()
