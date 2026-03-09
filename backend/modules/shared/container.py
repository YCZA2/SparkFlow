from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
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

from .infrastructure import (
    PromptLoader,
    create_audio_storage,
    create_external_media_provider,
    create_imported_audio_storage,
    create_prompt_loader,
    create_vector_store,
    create_web_search_provider,
    create_workflow_provider,
)
from .ports import (
    AudioStorage,
    EmbeddingProvider,
    ExternalMediaProvider,
    ImportedAudioStorage,
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
    audio_storage: AudioStorage
    imported_audio_storage: ImportedAudioStorage
    external_media_provider: ExternalMediaProvider
    prompt_loader: PromptLoader
    web_search_provider: WebSearchProvider
    workflow_provider: WorkflowProvider
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
        audio_storage=create_audio_storage(settings.UPLOAD_DIR),
        imported_audio_storage=create_imported_audio_storage(settings.UPLOAD_DIR),
        external_media_provider=create_external_media_provider(),
        prompt_loader=create_prompt_loader(Path(__file__).resolve().parents[2] / "prompts"),
        web_search_provider=create_web_search_provider(),
        workflow_provider=create_workflow_provider(settings=settings),
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
