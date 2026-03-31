from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from core.exceptions import ServiceUnavailableError, ValidationError
from modules.shared.fragment_snapshots import FragmentSnapshotReader

from modules.shared.media.media_ingestion_persistence import MediaIngestionPersistenceService
from modules.shared.media.media_ingestion_steps import MediaIngestionStepExecutor
from modules.shared.media.stored_file_payloads import stored_file_to_payload

PIPELINE_TYPE_MEDIA_INGESTION = "media_ingestion"
_FRAGMENT_SNAPSHOT_READER = FragmentSnapshotReader()


@dataclass
class AudioIngestionRequest:
    user_id: str
    audio_file: Any
    audio_source: str
    fragment_id: str | None = None
    local_fragment_id: str | None = None
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
        normalized_local_fragment_id = str(request.local_fragment_id or "").strip()
        if not normalized_local_fragment_id:
            raise ValidationError(
                message="缺少本地 fragment 标识",
                field_errors={"local_fragment_id": "媒体导入前必须先创建本地占位 fragment"},
            )
        self._ensure_fragment_placeholder(
            db=db,
            user_id=request.user_id,
            fragment_id=normalized_local_fragment_id,
            folder_id=request.folder_id,
            audio_source=request.audio_source,
        )
        run = await self.pipeline_runner.create_run(
            run_id=None,
            user_id=request.user_id,
            pipeline_type=PIPELINE_TYPE_MEDIA_INGESTION,
            input_payload={
                "source_kind": request.audio_source,
                "audio_file": stored_file_to_payload(request.audio_file),
                "folder_id": request.folder_id,
                "fragment_id": None,
                "local_fragment_id": normalized_local_fragment_id,
                "source_context": request.source_context,
            },
            resource_type="local_fragment",
            resource_id=normalized_local_fragment_id,
        )
        return AudioIngestionResult(
            pipeline_run_id=run.id,
            fragment_id=None,
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
        local_fragment_id: str | None = None,
    ) -> AudioIngestionResult:
        """创建外链导入流水线并返回异步任务句柄。"""
        self.step_executor.validate_folder_exists(db=db, user_id=user_id, folder_id=folder_id)
        normalized_local_fragment_id = str(local_fragment_id or "").strip()
        if not normalized_local_fragment_id:
            raise ValidationError(
                message="缺少本地 fragment 标识",
                field_errors={"local_fragment_id": "外链导入前必须先创建本地占位 fragment"},
            )
        self._ensure_fragment_placeholder(
            db=db,
            user_id=user_id,
            fragment_id=normalized_local_fragment_id,
            folder_id=folder_id,
            audio_source="external_link",
        )
        run = await self.pipeline_runner.create_run(
            run_id=None,
            user_id=user_id,
            pipeline_type=PIPELINE_TYPE_MEDIA_INGESTION,
            input_payload={
                "source_kind": "external_link",
                "fragment_id": None,
                "local_fragment_id": normalized_local_fragment_id,
                "folder_id": folder_id,
                "share_url": share_url,
                "platform": platform,
            },
            resource_type="local_fragment",
            resource_id=normalized_local_fragment_id,
        )
        return AudioIngestionResult(
            pipeline_run_id=run.id,
            fragment_id=None,
            audio_file=None,
            source="voice",
            audio_source="external_link",
        )

    def build_pipeline_definitions(self):
        """透传媒体导入流水线的固定步骤定义。"""
        return self.step_executor.build_pipeline_definitions()

    @staticmethod
    def _ensure_fragment_placeholder(
        *,
        db,
        user_id: str,
        fragment_id: str,
        folder_id: str | None,
        audio_source: str | None,
    ) -> None:
        """为导入中的 fragment 预建最小快照，避免文件夹统计和删除漏算。"""
        _FRAGMENT_SNAPSHOT_READER.merge_server_fields(
            db=db,
            user_id=user_id,
            fragment_id=fragment_id,
            source="voice",
            audio_source=audio_source,
            client_seed={
                "folder_id": folder_id,
                "body_html": "",
                "plain_text_snapshot": "",
                "content_state": "empty",
            },
            server_patch={},
        )


def build_media_ingestion_pipeline_service(container) -> AudioIngestionUseCase:
    """基于容器组装媒体导入入口与步骤执行器。"""
    persistence_service = MediaIngestionPersistenceService()
    step_executor = MediaIngestionStepExecutor(persistence_service=persistence_service)
    return AudioIngestionUseCase(
        pipeline_runner=container.pipeline_runner,
        step_executor=step_executor,
        stt_provider=container.stt_provider,
    )
