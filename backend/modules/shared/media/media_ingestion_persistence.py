from __future__ import annotations

from modules.shared.fragment_snapshots import FragmentSnapshotReader
from modules.shared.media.stored_file_payloads import stored_file_from_payload
from modules.shared.ports import FileStorage

_FRAGMENT_SNAPSHOT_READER = FragmentSnapshotReader()


class MediaIngestionPersistenceService:
    """封装媒体导入流程中的数据库回写与终态组装。"""

    def update_fragment_audio_file(
        self,
        *,
        db,
        fragment_id: str,
        user_id: str,
        saved,
        file_url: str | None = None,
        expires_at: str | None = None,
        audio_source: str | None = None,
    ) -> None:
        """把保存后的音频元数据补写回 fragment snapshot。"""
        normalized_fragment_id = str(fragment_id or "").strip()
        if not normalized_fragment_id:
            return
        _FRAGMENT_SNAPSHOT_READER.merge_server_fields(
            db=db,
            user_id=user_id,
            fragment_id=normalized_fragment_id,
            source="voice",
            audio_source=audio_source,
            server_patch={
                "audio_object_key": saved.object_key,
                "audio_file_url": file_url,
                "audio_file_expires_at": expires_at,
            },
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
        """把转写、摘要和说话人分段补写到 fragment snapshot。"""
        normalized_fragment_id = str(fragment_id or "").strip()
        if not normalized_fragment_id:
            return
        _FRAGMENT_SNAPSHOT_READER.merge_server_fields(
            db=db,
            user_id=user_id,
            fragment_id=normalized_fragment_id,
            source="voice",
            server_patch={
                "transcript": transcript,
                "summary": summary,
                "tags": list(tags),
                "system_tags": list(tags),
                "speaker_segments": list(speaker_segments),
            },
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
        """组装媒体导入任务的稳定终态输出。"""
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
                "system_tags": enrichment_payload.get("system_tags") or enrichment_payload.get("tags") or [],
                "system_purpose": enrichment_payload.get("system_purpose") or "other",
                "platform": audio_payload.get("platform") or source_context.get("platform"),
                "share_url": audio_payload.get("share_url") or source_context.get("share_url"),
                "media_id": audio_payload.get("media_id") or source_context.get("media_id"),
                "title": audio_payload.get("title") or source_context.get("title"),
                "author": audio_payload.get("author") or source_context.get("author"),
                "cover_url": audio_payload.get("cover_url") or source_context.get("cover_url"),
                "content_type": audio_payload.get("content_type") or source_context.get("content_type"),
            },
        }
