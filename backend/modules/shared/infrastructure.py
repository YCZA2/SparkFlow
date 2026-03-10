from __future__ import annotations

from fastapi import BackgroundTasks

from .ports import JobRunner
from .prompts import PromptLoader, create_prompt_loader
from .providers import (
    NoopWebSearchProvider,
    create_daily_push_workflow_provider,
    create_external_media_provider,
    create_web_search_provider,
    create_workflow_provider,
)
from .storage import (
    LocalFileStorage,
    OssFileStorage,
    build_audio_object_key,
    build_imported_audio_object_key,
    build_media_asset_object_key,
    create_file_storage,
    normalize_audio_extension,
    normalize_object_key,
    sanitize_filename,
    validate_audio_upload,
    validate_media_upload,
)
from .vector_store import AppVectorStore, create_vector_store


class FastApiBackgroundJobRunner(JobRunner):
    """把后台任务挂到 FastAPI BackgroundTasks。"""

    def __init__(self, background_tasks: BackgroundTasks) -> None:
        """保存 FastAPI 后台任务对象。"""
        self.background_tasks = background_tasks

    def schedule(self, task, /, *args, **kwargs) -> None:
        """把任务转交给 FastAPI 处理。"""
        self.background_tasks.add_task(task, *args, **kwargs)
