from __future__ import annotations

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from core.config import settings
from core.logging_config import get_logger
from utils.time import get_app_timezone

logger = get_logger(__name__)


class SchedulerService:
    def __init__(self, *, scheduler: AsyncIOScheduler, run_job, run_writing_context_job) -> None:
        """封装调度器生命周期，避免重复注册任务。"""
        self.scheduler = scheduler
        self.run_job = run_job
        self.run_writing_context_job = run_writing_context_job

    def start(self) -> None:
        """启动调度器并注册已启用的每日任务。"""
        registered_job = False
        if settings.ENABLE_DAILY_PUSH_SCHEDULER and self.scheduler.get_job("daily-fragment-aggregate") is None:
            self.scheduler.add_job(
                self.run_job,
                trigger="cron",
                id="daily-fragment-aggregate",
                replace_existing=True,
                hour=settings.DAILY_PUSH_HOUR,
                minute=settings.DAILY_PUSH_MINUTE,
            )
            registered_job = True
        if settings.ENABLE_WRITING_CONTEXT_SCHEDULER and self.scheduler.get_job("daily-writing-context-maintenance") is None:
            self.scheduler.add_job(
                self.run_writing_context_job,
                trigger="cron",
                id="daily-writing-context-maintenance",
                replace_existing=True,
                hour=settings.WRITING_CONTEXT_SCHEDULER_HOUR,
                minute=settings.WRITING_CONTEXT_SCHEDULER_MINUTE,
            )
            registered_job = True
        if not registered_job and not self.scheduler.running:
            logger.info("scheduler_skipped", reason="no_scheduler_jobs_enabled")
            return
        if not self.scheduler.running:
            self.scheduler.start()
            logger.info(
                "scheduler_started",
                daily_push_enabled=settings.ENABLE_DAILY_PUSH_SCHEDULER,
                writing_context_enabled=settings.ENABLE_WRITING_CONTEXT_SCHEDULER,
            )

    def stop(self) -> None:
        """停止调度器，避免测试或重载残留任务。"""
        if self.scheduler.running:
            self.scheduler.shutdown(wait=False)
            logger.info("scheduler_stopped")


def create_scheduler() -> AsyncIOScheduler:
    """创建绑定业务时区的异步调度器。"""
    return AsyncIOScheduler(timezone=get_app_timezone())
