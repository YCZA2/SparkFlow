from __future__ import annotations

import json

from domains.fragments import repository as fragment_repository

from modules.shared.ports import FileStorage
from modules.shared.media.stored_file_payloads import stored_file_from_payload


class MediaIngestionPersistenceService:
    """封装媒体导入流程中的数据库回写与终态组装。"""

    def update_fragment_audio_file(
        self,
        *,
        db,
        fragment_id: str,
        user_id: str,
        saved,
    ) -> None:
        """把保存后的音频元数据补写回碎片。"""
        if not fragment_id:
            return
        fragment_repository.update_audio_file(
            db=db,
            fragment_id=fragment_id,
            user_id=user_id,
            audio_storage_provider=saved.storage_provider,
            audio_bucket=saved.bucket,
            audio_object_key=saved.object_key,
            audio_access_level=saved.access_level,
            audio_original_filename=saved.original_filename,
            audio_mime_type=saved.mime_type,
            audio_file_size=saved.file_size,
            audio_checksum=saved.checksum,
        )

    def save_transcription_result(
        self,
        *,
        db,
        fragment_id: str,
        user_id: str,
        transcript: str,
        summary: str | None,
        tags: list[str],
        speaker_segments: list[dict],
    ) -> None:
        """把转写、摘要和说话人分段落库到碎片。"""
        if not fragment_id:
            return
        fragment_repository.save_transcription_result(
            db=db,
            fragment_id=fragment_id,
            user_id=user_id,
            transcript=transcript,
            summary=summary,
            tags_json=json.dumps(tags, ensure_ascii=False),
            speaker_segments_json=json.dumps(speaker_segments, ensure_ascii=False),
        )

    def build_finalize_payload(
        self,
        *,
        file_storage: FileStorage,
        input_payload: dict,
        audio_payload: dict,
        transcript_payload: dict,
        enrichment_payload: dict,
    ) -> dict:
        """组装媒体导入流水线的稳定终态输出。"""
        source_context = input_payload.get("source_context") or {}
        fragment_id = input_payload["fragment_id"]
        local_fragment_id = input_payload.get("local_fragment_id")
        stored_file = stored_file_from_payload(audio_payload.get("audio_file") or input_payload.get("audio_file"))
        access = file_storage.create_download_url(stored_file) if stored_file is not None else None
        return {
            "resource_type": "local_fragment" if local_fragment_id else "fragment",
            "resource_id": local_fragment_id or fragment_id,
            "run_output": {
                "fragment_id": fragment_id,
                "local_fragment_id": local_fragment_id,
                "source": "voice",
                "audio_source": input_payload.get("source_kind"),
                "audio_file": audio_payload.get("audio_file") or input_payload.get("audio_file"),
                "audio_object_key": stored_file.object_key if stored_file is not None else None,
                "audio_file_url": access.url if access else audio_payload.get("audio_file_url"),
                "audio_file_expires_at": access.expires_at if access else audio_payload.get("audio_file_expires_at"),
                "transcript": transcript_payload.get("transcript"),
                "speaker_segments": transcript_payload.get("speaker_segments") or [],
                "summary": enrichment_payload.get("summary"),
                "tags": enrichment_payload.get("tags") or [],
                "platform": audio_payload.get("platform") or source_context.get("platform"),
                "share_url": audio_payload.get("share_url") or source_context.get("share_url"),
                "media_id": audio_payload.get("media_id") or source_context.get("media_id"),
                "title": audio_payload.get("title") or source_context.get("title"),
                "author": audio_payload.get("author") or source_context.get("author"),
                "cover_url": audio_payload.get("cover_url") or source_context.get("cover_url"),
                "content_type": audio_payload.get("content_type") or source_context.get("content_type"),
            },
        }
