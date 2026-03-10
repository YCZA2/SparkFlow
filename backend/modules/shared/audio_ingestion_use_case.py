from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from core.exceptions import ServiceUnavailableError
from domains.fragments import repository as fragment_repository

from .media_ingestion_persistence import MediaIngestionPersistenceService
from .media_ingestion_steps import MediaIngestionStepExecutor
from .stored_file_payloads import stored_file_to_payload

PIPELINE_TYPE_MEDIA_INGESTION = "media_ingestion"


@dataclass
class AudioIngestionRequest:
    user_id: str
    audio_file: Any
    audio_source: str
    fragment_id: str | None = None
    folder_id: str | None = None
    source_context: dict[str, Any] = field(default_factory=dict)


@dataclass
class AudioIngestionResult:
    pipeline_run_id: str
    fragment_id: str | None
    audio_file: Any
    source: str
    audio_source: str


class AudioIngestionUseCase:
    """封装媒体导入任务创建入口。"""

    def __init__(
        self,
        *,
        pipeline_runner,
        step_executor: MediaIngestionStepExecutor,
        stt_provider,
    ) -> None:
        """装配媒体导入入口依赖。"""
        self.pipeline_runner = pipeline_runner
        self.step_executor = step_executor
        self.stt_provider = stt_provider

    async def ensure_transcription_available(self) -> None:
        """在上传前检查转写服务是否可用。"""
        try:
            is_available = await self.stt_provider.health_check()
            if not is_available:
                raise RuntimeError("health check returned unavailable")
        except Exception as exc:
            raise ServiceUnavailableError(
                message=f"语音转写服务暂时不可用: {str(exc)}",
                service_name="stt",
            ) from exc

    async def ingest_audio(
        self,
        *,
        db,
        request: AudioIngestionRequest,
    ) -> AudioIngestionResult:
        """创建上传音频流水线并返回异步任务句柄。"""
        self.step_executor.validate_audio_source(request.audio_source)
        self.step_executor.validate_folder_exists(db=db, user_id=request.user_id, folder_id=request.folder_id)
        fragment_id = request.fragment_id
        if fragment_id is None:
            fragment = fragment_repository.create(
                db=db,
                user_id=request.user_id,
                transcript=None,
                source="voice",
                audio_source=request.audio_source,
                audio_storage_provider=request.audio_file.storage_provider if request.audio_file else None,
                audio_bucket=request.audio_file.bucket if request.audio_file else None,
                audio_object_key=request.audio_file.object_key if request.audio_file else None,
                audio_access_level=request.audio_file.access_level if request.audio_file else None,
                audio_original_filename=request.audio_file.original_filename if request.audio_file else None,
                audio_mime_type=request.audio_file.mime_type if request.audio_file else None,
                audio_file_size=request.audio_file.file_size if request.audio_file else None,
                audio_checksum=request.audio_file.checksum if request.audio_file else None,
                folder_id=request.folder_id,
            )
            fragment_id = fragment.id
        run = await self.pipeline_runner.create_run(
            run_id=None,
            user_id=request.user_id,
            pipeline_type=PIPELINE_TYPE_MEDIA_INGESTION,
            input_payload={
                "source_kind": request.audio_source,
                "audio_file": stored_file_to_payload(request.audio_file),
                "folder_id": request.folder_id,
                "fragment_id": fragment_id,
                "source_context": request.source_context,
            },
            resource_type="fragment",
            resource_id=fragment_id,
        )
        return AudioIngestionResult(
            pipeline_run_id=run.id,
            fragment_id=fragment_id,
            audio_file=request.audio_file,
            source="voice",
            audio_source=request.audio_source,
        )

    async def ingest_external_media(
        self,
        *,
        db,
        user_id: str,
        share_url: str,
        platform: str,
        folder_id: str | None = None,
    ) -> AudioIngestionResult:
        """创建外链导入流水线并返回异步任务句柄。"""
        self.step_executor.validate_folder_exists(db=db, user_id=user_id, folder_id=folder_id)
        fragment = fragment_repository.create(
            db=db,
            user_id=user_id,
            transcript=None,
            source="voice",
            audio_source="external_link",
            audio_storage_provider=None,
            audio_bucket=None,
            audio_object_key=None,
            audio_access_level=None,
            audio_original_filename=None,
            audio_mime_type=None,
            audio_file_size=None,
            audio_checksum=None,
            folder_id=folder_id,
        )
        run = await self.pipeline_runner.create_run(
            run_id=None,
            user_id=user_id,
            pipeline_type=PIPELINE_TYPE_MEDIA_INGESTION,
            input_payload={
                "source_kind": "external_link",
                "fragment_id": fragment.id,
                "folder_id": folder_id,
                "share_url": share_url,
                "platform": platform,
            },
            resource_type="fragment",
            resource_id=fragment.id,
        )
        return AudioIngestionResult(
            pipeline_run_id=run.id,
            fragment_id=fragment.id,
            audio_file=None,
            source="voice",
            audio_source="external_link",
        )

    def build_pipeline_definitions(self):
        """透传媒体导入流水线的固定步骤定义。"""
        return self.step_executor.build_pipeline_definitions()


def build_media_ingestion_pipeline_service(container) -> AudioIngestionUseCase:
    """基于容器组装媒体导入入口与步骤执行器。"""
    persistence_service = MediaIngestionPersistenceService()
    step_executor = MediaIngestionStepExecutor(persistence_service=persistence_service)
    return AudioIngestionUseCase(
        pipeline_runner=container.pipeline_runner,
        step_executor=step_executor,
        stt_provider=container.stt_provider,
    )
