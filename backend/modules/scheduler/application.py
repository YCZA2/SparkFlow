from __future__ import annotations

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from core.config import settings
from utils.time import get_app_timezone

logger = logging.getLogger(__name__)


class SchedulerService:
    def __init__(self, *, scheduler: AsyncIOScheduler, run_job) -> None:
        self.scheduler = scheduler
        self.run_job = run_job

    def start(self) -> None:
        if self.scheduler.get_job("daily-fragment-aggregate") is None:
            self.scheduler.add_job(
                self.run_job,
                trigger="cron",
                id="daily-fragment-aggregate",
                replace_existing=True,
                hour=settings.DAILY_PUSH_HOUR,
                minute=settings.DAILY_PUSH_MINUTE,
            )
        if not self.scheduler.running:
            self.scheduler.start()

    def stop(self) -> None:
        if self.scheduler.running:
            self.scheduler.shutdown(wait=False)


def create_scheduler() -> AsyncIOScheduler:
    return AsyncIOScheduler(timezone=get_app_timezone())
