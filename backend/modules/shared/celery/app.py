from __future__ import annotations

from celery import Celery
from celery.schedules import crontab

from core.config import Settings

_celery_app: Celery | None = None


def build_celery_app(settings: Settings) -> Celery:
    """构建全局复用的 Celery 应用实例。"""
    global _celery_app
    if _celery_app is not None:
        return _celery_app

    app = Celery("sparkflow")
    app.conf.update(
        broker_url=settings.CELERY_BROKER_URL,
        result_backend=settings.CELERY_RESULT_BACKEND,
        task_default_queue="default",
        task_track_started=True,
        task_always_eager=settings.CELERY_TASK_ALWAYS_EAGER,
        task_eager_propagates=settings.CELERY_TASK_EAGER_PROPAGATES,
        task_serializer="json",
        result_serializer="json",
        accept_content=["json"],
        timezone=settings.APP_TIMEZONE,
        enable_utc=True,
        worker_prefetch_multiplier=1,
        worker_concurrency=settings.CELERY_WORKER_CONCURRENCY,
        broker_connection_retry_on_startup=True,
    )

    beat_schedule: dict[str, dict] = {}
    if settings.ENABLE_DAILY_PUSH_SCHEDULER:
        beat_schedule["enqueue-daily-push"] = {
            "task": "sparkflow.periodic.enqueue_daily_push",
            "schedule": crontab(hour=settings.DAILY_PUSH_HOUR, minute=settings.DAILY_PUSH_MINUTE),
            "options": {"queue": "daily-push"},
        }
    if settings.ENABLE_WRITING_CONTEXT_SCHEDULER:
        beat_schedule["refresh-writing-context"] = {
            "task": "sparkflow.periodic.refresh_writing_context",
            "schedule": crontab(
                hour=settings.WRITING_CONTEXT_SCHEDULER_HOUR,
                minute=settings.WRITING_CONTEXT_SCHEDULER_MINUTE,
            ),
            "options": {"queue": "script-generation"},
        }
    app.conf.beat_schedule = beat_schedule

    from .tasks import register_celery_tasks

    register_celery_tasks(app)
    _celery_app = app
    return app
