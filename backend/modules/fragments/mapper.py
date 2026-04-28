from __future__ import annotations

from pathlib import Path
from typing import Optional

from models import MediaAsset
from modules.shared.content.content_schemas import MediaAssetItem
from modules.shared.fragment_snapshots import FragmentSnapshot, effective_fragment_purpose, effective_fragment_tags
from modules.shared.ports import FileStorage, StoredFile
from utils.serialization import format_iso_datetime

from .content import read_fragment_body_html, read_fragment_plain_text, resolve_fragment_content_state
from .schemas import FragmentFolderInfo, FragmentItem, SpeakerSegmentItem


def _map_snapshot_speaker_segments(raw: Optional[list[dict]]) -> Optional[list[SpeakerSegmentItem]]:
    """把 snapshot 里的说话人分段规整为响应结构。"""
    if not raw:
        return None
    normalized: list[SpeakerSegmentItem] = []
    for item in raw:
        try:
            start_ms = int(item.get("start_ms"))
            end_ms = int(item.get("end_ms"))
        except (TypeError, ValueError):
            continue
        speaker_id = str(item.get("speaker_id") or "").strip()
        text = str(item.get("text") or "").strip()
        if speaker_id and text and end_ms >= start_ms:
            normalized.append(
                SpeakerSegmentItem(
                    speaker_id=speaker_id,
                    start_ms=start_ms,
                    end_ms=end_ms,
                    text=text,
                )
            )
    return normalized or None


def map_media_asset(asset: MediaAsset) -> MediaAssetItem:
    """将媒体资源模型映射为对外响应结构。"""
    return MediaAssetItem(
        id=asset.id,
        media_kind=asset.media_kind,
        original_filename=asset.original_filename,
        mime_type=asset.mime_type,
        file_size=asset.file_size,
        checksum=asset.checksum,
        width=asset.width,
        height=asset.height,
        duration_ms=asset.duration_ms,
        status=asset.status,
        created_at=format_iso_datetime(asset.created_at),
    )


def build_media_asset_file(asset: MediaAsset) -> StoredFile:
    """从素材模型恢复统一文件元数据。"""
    return StoredFile(
        storage_provider=asset.storage_provider,
        bucket=asset.bucket,
        object_key=asset.object_key,
        access_level=asset.access_level or "private",
        original_filename=asset.original_filename,
        mime_type=asset.mime_type,
        file_size=asset.file_size,
        checksum=asset.checksum,
    )


def map_fragment_snapshot(
    snapshot: FragmentSnapshot,
    *,
    media_assets: list[MediaAssetItem] | None = None,
    folder: FragmentFolderInfo | None = None,
) -> FragmentItem:
    """将 fragment snapshot 映射为统一响应结构，供导出与检索复用。"""
    return FragmentItem(
        id=snapshot.id,
        transcript=snapshot.transcript,
        speaker_segments=_map_snapshot_speaker_segments(snapshot.speaker_segments),
        summary=snapshot.summary,
        tags=snapshot.tags,
        system_purpose=snapshot.system_purpose,
        user_purpose=snapshot.user_purpose,
        effective_purpose=effective_fragment_purpose(snapshot),
        system_tags=snapshot.system_tags,
        user_tags=snapshot.user_tags,
        dismissed_system_tags=snapshot.dismissed_system_tags,
        effective_tags=effective_fragment_tags(snapshot),
        source=snapshot.source,
        audio_source=snapshot.audio_source,
        created_at=format_iso_datetime(snapshot.created_at),
        updated_at=format_iso_datetime(snapshot.updated_at),
        audio_object_key=snapshot.audio_object_key,
        audio_file_url=snapshot.audio_file_url,
        audio_file_expires_at=snapshot.audio_file_expires_at,
        folder_id=snapshot.folder_id,
        folder=folder,
        body_html=read_fragment_body_html(snapshot),
        plain_text_snapshot=read_fragment_plain_text(snapshot) or None,
        content_state=resolve_fragment_content_state(snapshot),
        media_assets=media_assets or [],
    )
