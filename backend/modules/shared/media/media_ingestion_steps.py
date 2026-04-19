from __future__ import annotations

import asyncio
import mimetypes
from pathlib import Path
from typing import Any

from core.exceptions import AppException, ValidationError
from core.logging_config import get_logger
from sqlalchemy.orm import Session

from domains.fragment_folders import repository as fragment_folder_repository
from modules.shared.tasks.task_types import TaskExecutionContext, TaskExecutionError, TaskStepDefinition

from modules.shared.media.media_ingestion_persistence import MediaIngestionPersistenceService
from modules.shared.ports import ExternalMediaProvider
from modules.shared.infrastructure.storage import build_imported_audio_object_key, sanitize_filename
from modules.shared.media.stored_file_payloads import stored_file_from_payload, stored_file_to_payload
from modules.fragments.derivative_task import TASK_TYPE_FRAGMENT_DERIVATIVE_BACKFILL

logger = get_logger(__name__)


class MediaIngestionStepExecutor:
    """封装媒体导入任务的步骤执行逻辑。"""

    def __init__(self, *, persistence_service: MediaIngestionPersistenceService) -> None:
        """装配媒体导入步骤依赖。"""
        self.persistence_service = persistence_service

    def build_task_definitions(self) -> list[TaskStepDefinition]:
        """返回媒体导入任务固定步骤定义。"""
        return [
            TaskStepDefinition(step_name="resolve_external_media", executor=self.resolve_external_media, max_attempts=2),
            TaskStepDefinition(step_name="download_media", executor=self.download_media, max_attempts=2),
            TaskStepDefinition(step_name="transcribe_audio", executor=self.transcribe_audio, max_attempts=3),
            TaskStepDefinition(step_name="finalize_fragment", executor=self.finalize_fragment, max_attempts=1),
        ]

    def _runtime_external_media_provider(self, context: TaskExecutionContext) -> ExternalMediaProvider | None:
        """按当前容器状态读取外链解析 provider。"""
        return context.container.external_media_provider

    def _runtime_file_storage(self, context: TaskExecutionContext):
        """按当前容器状态读取文件存储实现。"""
        return context.container.file_storage

    def _runtime_stt_provider(self, context: TaskExecutionContext):
        """按当前容器状态读取 STT provider。"""
        return context.container.stt_provider

    async def resolve_external_media(self, context: TaskExecutionContext) -> dict[str, Any]:
        """解析外链媒体并拿到临时音频文件。"""
        payload = context.input_payload
        if payload.get("source_kind") != "external_link":
            return {"skipped": True}
        if payload.get("audio_file"):
            return {"skipped": True, **(payload.get("source_context") or {})}
        external_media_provider = self._runtime_external_media_provider(context)
        if external_media_provider is None:
            raise RuntimeError("external_media_provider is not configured")
        try:
            resolved = await external_media_provider.resolve_audio(
                share_url=payload["share_url"],
                platform=payload.get("platform") or "auto",
            )
        except Exception as exc:
            raise self.wrap_external_media_error(exc, fallback_message="外链解析失败") from exc
        return {
            "platform": resolved.platform,
            "share_url": resolved.share_url,
            "media_id": resolved.media_id,
            "title": resolved.title,
            "author": resolved.author,
            "cover_url": resolved.cover_url,
            "content_type": resolved.content_type,
            "local_audio_path": resolved.local_audio_path,
        }

    async def download_media(self, context: TaskExecutionContext) -> dict[str, Any]:
        """保存外链音频产物，并把对象元数据补写回碎片。"""
        payload = context.input_payload
        if payload.get("source_kind") != "external_link":
            return {"audio_file": payload.get("audio_file")}
        if payload.get("audio_file"):
            return {
                "audio_file": payload.get("audio_file"),
                **(payload.get("source_context") or {}),
            }
        file_storage = self._runtime_file_storage(context)
        resolved = context.get_step_output("resolve_external_media")
        filename = self.build_external_filename(
            platform=resolved["platform"],
            media_id=resolved["media_id"],
            title=resolved.get("title"),
        )
        mime_type = mimetypes.guess_type(filename)[0] or "audio/m4a"
        object_key = build_imported_audio_object_key(
            user_id=context.run.user_id,
            fragment_id=payload.get("fragment_id") or payload.get("local_fragment_id") or "local-fragment",
            platform=resolved["platform"],
            filename=filename,
        )
        try:
            saved = await file_storage.save_local_file(
                source_path=resolved["local_audio_path"],
                object_key=object_key,
                original_filename=filename,
                mime_type=mime_type,
            )
        except Exception as exc:
            raise TaskExecutionError(
                f"媒体音频保存失败: {str(exc) or 'unknown error'}",
                retryable=True,
            ) from exc
        finally:
            await self.cleanup_temp(resolved.get("local_audio_path"))
        access = file_storage.create_download_url(saved)
        self.persistence_service.update_fragment_audio_file(
            db=context.db,
            fragment_id=payload.get("local_fragment_id") or payload.get("fragment_id"),
            user_id=context.run.user_id,
            saved=saved,
            file_url=access.url,
            expires_at=access.expires_at,
            audio_source=str(payload.get("source_kind") or "external_link"),
        )
        return {
            "audio_file": stored_file_to_payload(saved),
            "platform": resolved["platform"],
            "share_url": resolved["share_url"],
            "media_id": resolved["media_id"],
            "title": resolved.get("title"),
            "author": resolved.get("author"),
            "cover_url": resolved.get("cover_url"),
            "content_type": resolved.get("content_type"),
            "audio_file_url": access.url,
            "audio_file_expires_at": access.expires_at,
        }

    async def transcribe_audio(self, context: TaskExecutionContext) -> dict[str, Any]:
        """调用 STT 把音频转成文本。"""
        payload = context.input_payload
        stored_file = stored_file_from_payload(context.get_step_output("download_media").get("audio_file") or payload.get("audio_file"))
        if stored_file is None:
            raise RuntimeError("audio file missing for transcription")
        file_storage = self._runtime_file_storage(context)
        materialized = file_storage.materialize(stored_file)
        try:
            try:
                result = await self._runtime_stt_provider(context).transcribe(str(materialized.local_path))
            except asyncio.CancelledError as exc:
                raise TaskExecutionError("语音转写被取消", retryable=False) from exc
            except Exception as exc:
                raise TaskExecutionError(
                    f"语音转写失败: {str(exc) or 'unknown error'}",
                    retryable=True,
                ) from exc
        finally:
            materialized.cleanup()
        transcript = result.text or ""
        normalized_segments = self.normalize_speaker_segments(getattr(result, "speaker_segments", None) or [])
        return {
            "audio_file": stored_file_to_payload(stored_file),
            "transcript": transcript,
            "speaker_segments": normalized_segments,
        }

    async def finalize_fragment(self, context: TaskExecutionContext) -> dict[str, Any]:
        """落库最终转写内容并结束媒体任务。"""
        transcript_payload = context.get_step_output("transcribe_audio")
        audio_payload = context.get_step_output("download_media")
        self.persistence_service.save_transcription_result(
            db=context.db,
            fragment_id=context.input_payload.get("local_fragment_id") or context.input_payload.get("fragment_id"),
            user_id=context.run.user_id,
            transcript=transcript_payload.get("transcript") or "",
            summary=None,
            tags=[],
            speaker_segments=transcript_payload.get("speaker_segments") or [],
        )
        await self.enqueue_fragment_derivative_backfill(
            context=context,
            fragment_id=context.input_payload.get("fragment_id"),
            local_fragment_id=context.input_payload.get("local_fragment_id"),
            effective_text=transcript_payload.get("transcript") or "",
            source=str(context.input_payload.get("source") or "voice"),
            audio_source=context.input_payload.get("source_kind"),
        )
        return self.persistence_service.build_finalize_payload(
            file_storage=self._runtime_file_storage(context),
            input_payload=context.input_payload,
            audio_payload=audio_payload,
            transcript_payload=transcript_payload,
            enrichment_payload={},
        )

    async def enqueue_fragment_derivative_backfill(
        self,
        *,
        context: TaskExecutionContext,
        fragment_id: str | None,
        local_fragment_id: str | None,
        effective_text: str,
        source: str,
        audio_source: str | None,
    ) -> None:
        """在 transcript 落库后最佳努力创建异步衍生字段回填任务。"""
        normalized_fragment_id = str(fragment_id or "").strip()
        normalized_local_fragment_id = str(local_fragment_id or "").strip()
        if not normalized_fragment_id and not normalized_local_fragment_id:
            return
        task_runner = context.container.task_runner
        if task_runner is None:
            logger.warning(
                "fragment_derivative_task_runner_missing",
                fragment_id=normalized_local_fragment_id or normalized_fragment_id,
                user_id=context.run.user_id,
            )
            return
        try:
            await task_runner.create_run(
                run_id=None,
                user_id=context.run.user_id,
                task_type=TASK_TYPE_FRAGMENT_DERIVATIVE_BACKFILL,
                input_payload={
                    "fragment_id": normalized_fragment_id or None,
                    "local_fragment_id": normalized_local_fragment_id or None,
                    "effective_text": effective_text,
                    "source": source,
                    "audio_source": audio_source,
                },
                resource_type="local_fragment" if normalized_local_fragment_id else "fragment",
                resource_id=normalized_local_fragment_id or normalized_fragment_id,
            )
        except Exception as exc:
            logger.warning(
                "fragment_derivative_backfill_enqueue_failed",
                fragment_id=normalized_local_fragment_id or normalized_fragment_id,
                user_id=context.run.user_id,
                error=str(exc),
            )

    @staticmethod
    def normalize_speaker_segments(speaker_segments: list[Any]) -> list[dict[str, Any]]:
        """将供应商分段结构归一化为可持久化字典。"""
        normalized_segments = []
        for segment in speaker_segments:
            if isinstance(segment, dict):
                speaker_id = segment.get("speaker_id")
                start_ms = segment.get("start_ms")
                end_ms = segment.get("end_ms")
                text = segment.get("text")
            else:
                speaker_id = getattr(segment, "speaker_id", None)
                start_ms = getattr(segment, "start_ms", None)
                end_ms = getattr(segment, "end_ms", None)
                text = getattr(segment, "text", None)
            if speaker_id is None or start_ms is None or end_ms is None or text is None:
                continue
            normalized_segments.append(
                {
                    "speaker_id": str(speaker_id),
                    "start_ms": int(start_ms),
                    "end_ms": int(end_ms),
                    "text": str(text),
                }
            )
        return normalized_segments

    @staticmethod
    def build_external_filename(*, platform: str, media_id: str, title: str | None) -> str:
        """根据平台和标题构造稳定的文件名。"""
        stem = sanitize_filename(title or platform, platform)
        if stem == platform:
            return f"{platform}-{media_id}.m4a"
        return f"{stem}-{media_id}.m4a"

    @staticmethod
    async def cleanup_temp(path_value: str | None) -> None:
        """删除外链导入产生的临时文件。"""
        if not path_value:
            return
        path = Path(path_value)
        try:
            await asyncio.to_thread(path.unlink, missing_ok=True)
        except TypeError:
            if path.exists():
                await asyncio.to_thread(path.unlink)
        try:
            path.parent.rmdir()
        except OSError:
            pass

    @staticmethod
    def validate_folder_exists(db: Session, user_id: str, folder_id: str | None) -> None:
        """校验目标文件夹存在且属于当前用户。"""
        if folder_id is None:
            return
        folder = fragment_folder_repository.get_by_id(db=db, user_id=user_id, folder_id=folder_id)
        if not folder:
            from core.exceptions import NotFoundError

            raise NotFoundError(
                message="文件夹不存在或无权访问",
                resource_type="fragment_folder",
                resource_id=folder_id,
            )

    @staticmethod
    def validate_audio_source(audio_source: str) -> None:
        """校验允许的音频来源枚举。"""
        if audio_source not in {"upload", "external_link"}:
            raise ValidationError(
                message="无效的 audio_source 值",
                field_errors={"audio_source": "必须是 upload 或 external_link"},
            )

    @staticmethod
    def wrap_external_media_error(exc: Exception, *, fallback_message: str) -> TaskExecutionError:
        """将外链导入异常映射为带重试语义的任务错误。"""
        if isinstance(exc, TaskExecutionError):
            return exc
        if isinstance(exc, ValidationError):
            return TaskExecutionError(str(exc), retryable=False)
        if isinstance(exc, AppException):
            retryable = exc.status_code >= 500
            return TaskExecutionError(exc.message or fallback_message, retryable=retryable)
        return TaskExecutionError(f"{fallback_message}: {str(exc) or 'unknown error'}", retryable=True)
