"""Celery 命令入口。"""

from modules.shared.tasks.bootstrap import ensure_task_runtime

celery_app = ensure_task_runtime().celery_app
