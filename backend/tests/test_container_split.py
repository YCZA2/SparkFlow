from __future__ import annotations

import asyncio

from main import create_app
from modules.shared.prompts import PromptLoader
from modules.shared.storage import LocalFileStorage
from modules.shared.vector_store import AppVectorStore


def test_app_container_uses_split_shared_modules() -> None:
    """应用容器应装配拆分后的共享模块实现。"""
    app = create_app(enable_runtime_side_effects=False)
    container = app.state.container

    assert isinstance(container.file_storage, LocalFileStorage)
    assert isinstance(container.prompt_loader, PromptLoader)
    assert isinstance(container.vector_store, AppVectorStore)

    asyncio.run(container.workflow_provider.aclose())
    asyncio.run(container.daily_push_workflow_provider.aclose())
