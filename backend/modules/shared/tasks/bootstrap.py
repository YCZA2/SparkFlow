from __future__ import annotations

from typing import Iterable

from modules.document_import.pipeline_steps import (
    DocumentImportStepExecutor,
    PIPELINE_TYPE_DOCUMENT_IMPORT,
)
from modules.fragments.derivative_pipeline import (
    PIPELINE_TYPE_FRAGMENT_DERIVATIVE_BACKFILL,
    build_fragment_derivative_pipeline_service,
)
from modules.knowledge.rag_processing_pipeline import (
    PIPELINE_TYPE_REFERENCE_SCRIPT_PROCESSING,
    build_reference_script_processing_pipeline_service,
)
from modules.scripts.daily_push_pipeline import (
    PIPELINE_TYPE_DAILY_PUSH_GENERATION,
    build_daily_push_pipeline_service,
)
from modules.scripts.rag_pipeline import (
    PIPELINE_TYPE_RAG_SCRIPT_GENERATION,
    build_rag_script_pipeline_service,
)
from modules.shared.celery.app import build_celery_app
from modules.shared.celery.tasks import TASK_QUEUE_BY_TYPE
from modules.shared.infrastructure.container import ServiceContainer, build_container
from modules.shared.media.audio_ingestion import (
    PIPELINE_TYPE_MEDIA_INGESTION,
    build_media_ingestion_pipeline_service,
)

from .runtime import (
    LegacyPipelineDispatcherAdapter,
    TaskDefinitionRegistry,
    TaskRecoveryService,
    TaskRunner,
    TaskRuntimeState,
)
from .state import get_current_task_runtime, set_current_task_runtime


def _apply_default_queue(task_type: str, definitions: Iterable) -> list:
    """为步骤定义补默认队列。"""
    default_queue = TASK_QUEUE_BY_TYPE.get(task_type)
    result = []
    for definition in definitions:
        if getattr(definition, "queue", None) is None:
            definition.queue = default_queue
        result.append(definition)
    return result


def configure_task_runtime(container: ServiceContainer) -> TaskRuntimeState:
    """装配共享 task runtime，并同步回写到服务容器。"""
    definition_registry = TaskDefinitionRegistry()

    definition_registry.register(
        PIPELINE_TYPE_MEDIA_INGESTION,
        _apply_default_queue(
            PIPELINE_TYPE_MEDIA_INGESTION,
            build_media_ingestion_pipeline_service(container).build_pipeline_definitions(),
        ),
    )
    definition_registry.register(
        PIPELINE_TYPE_FRAGMENT_DERIVATIVE_BACKFILL,
        _apply_default_queue(
            PIPELINE_TYPE_FRAGMENT_DERIVATIVE_BACKFILL,
            build_fragment_derivative_pipeline_service(container).build_pipeline_definitions(),
        ),
    )
    definition_registry.register(
        PIPELINE_TYPE_DAILY_PUSH_GENERATION,
        _apply_default_queue(
            PIPELINE_TYPE_DAILY_PUSH_GENERATION,
            build_daily_push_pipeline_service(container).build_pipeline_definitions(),
        ),
    )
    definition_registry.register(
        PIPELINE_TYPE_REFERENCE_SCRIPT_PROCESSING,
        _apply_default_queue(
            PIPELINE_TYPE_REFERENCE_SCRIPT_PROCESSING,
            build_reference_script_processing_pipeline_service(container).build_pipeline_definitions(),
        ),
    )
    definition_registry.register(
        PIPELINE_TYPE_RAG_SCRIPT_GENERATION,
        _apply_default_queue(
            PIPELINE_TYPE_RAG_SCRIPT_GENERATION,
            build_rag_script_pipeline_service(container).build_pipeline_definitions(),
        ),
    )
    definition_registry.register(
        PIPELINE_TYPE_DOCUMENT_IMPORT,
        _apply_default_queue(
            PIPELINE_TYPE_DOCUMENT_IMPORT,
            DocumentImportStepExecutor().build_pipeline_definitions(),
        ),
    )

    celery_app = build_celery_app(container.settings)
    dispatcher = container.pipeline_dispatcher
    if not isinstance(dispatcher, LegacyPipelineDispatcherAdapter):
        dispatcher = LegacyPipelineDispatcherAdapter()
    container.celery_app = celery_app
    container.task_runner = TaskRunner(
        session_factory=container.session_factory,
        definition_registry=definition_registry,
        celery_app=celery_app,
        dispatcher=dispatcher,
    )
    container.task_recovery_service = TaskRecoveryService(
        session_factory=container.session_factory,
        definition_registry=definition_registry,
        celery_app=celery_app,
        dispatcher=dispatcher,
    )
    # 中文注释：业务层暂时保留旧命名别名，避免一次性重写所有 pipeline 调用点。
    container.pipeline_runner = container.task_runner
    container.pipeline_recovery_service = container.task_recovery_service
    container.pipeline_dispatcher = dispatcher
    runtime = TaskRuntimeState(
        container=container,
        celery_app=celery_app,
        definition_registry=definition_registry,
    )
    return set_current_task_runtime(runtime)


def ensure_task_runtime(container: ServiceContainer | None = None) -> TaskRuntimeState:
    """读取当前 runtime；未初始化时自动构建默认容器。"""
    if container is not None:
        return configure_task_runtime(container)
    current = get_current_task_runtime()
    if current is None:
        return configure_task_runtime(build_container())
    return current
