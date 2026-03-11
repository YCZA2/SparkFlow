from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from fastapi import Request
from sqlalchemy.orm import Session, sessionmaker

from core.config import Settings, settings
from models.database import SessionLocal
from services.factory import (
    create_embedding_service,
    create_llm_service,
    create_stt_service,
    create_vector_db_service,
)

from .providers import (
    create_daily_push_workflow_provider,
    create_external_media_provider,
    create_script_mode_a_workflow_provider,
    create_script_mode_b_workflow_provider,
    create_web_search_provider,
)
from .storage import create_file_storage
from .vector_store import create_vector_store
from .ports import (
    EmbeddingProvider,
    ExternalMediaProvider,
    FileStorage,
    SpeechToTextProvider,
    TextGenerationProvider,
    VectorStore,
    WebSearchProvider,
    WorkflowProvider,
)


@dataclass
class ServiceContainer:
    """描述应用运行时使用的依赖容器。"""

    settings: Settings
    session_factory: sessionmaker[Session]
    llm_provider: TextGenerationProvider
    stt_provider: SpeechToTextProvider
    embedding_provider: EmbeddingProvider
    vector_store: VectorStore
    file_storage: FileStorage
    external_media_provider: ExternalMediaProvider
    web_search_provider: WebSearchProvider
    script_mode_a_workflow_provider: WorkflowProvider
    script_mode_b_workflow_provider: WorkflowProvider
    daily_push_workflow_provider: WorkflowProvider
    pipeline_runner: Any | None = None
    pipeline_dispatcher: Any | None = None
    pipeline_recovery_service: Any | None = None


def build_container() -> ServiceContainer:
    """构建默认应用依赖容器。"""
    llm_provider = create_llm_service()
    stt_provider = create_stt_service()
    embedding_provider = create_embedding_service()
    vector_db_provider = create_vector_db_service()
    return ServiceContainer(
        settings=settings,
        session_factory=SessionLocal,
        llm_provider=llm_provider,
        stt_provider=stt_provider,
        embedding_provider=embedding_provider,
        vector_store=create_vector_store(embedding_provider=embedding_provider, vector_db_provider=vector_db_provider),
        file_storage=create_file_storage(settings),
        external_media_provider=create_external_media_provider(),
        web_search_provider=create_web_search_provider(),
        script_mode_a_workflow_provider=create_script_mode_a_workflow_provider(settings=settings),
        script_mode_b_workflow_provider=create_script_mode_b_workflow_provider(settings=settings),
        daily_push_workflow_provider=create_daily_push_workflow_provider(settings=settings),
    )


def get_container(request: Request) -> ServiceContainer:
    """从 FastAPI 应用状态中读取容器。"""
    return request.app.state.container


def get_db_session(request: Request):
    """基于容器 session factory 提供数据库会话。"""
    session = get_container(request).session_factory()
    try:
        yield session
    finally:
        session.close()
