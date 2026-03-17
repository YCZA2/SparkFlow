from __future__ import annotations

from pathlib import Path
from typing import Optional

from models import Fragment, MediaAsset
from modules.shared.content_schemas import MediaAssetItem
from modules.shared.ports import FileStorage, StoredFile
from utils.serialization import format_iso_datetime, parse_json_list, parse_json_object_list

from .content import read_fragment_body_html, read_fragment_plain_text, resolve_fragment_content_state
from .schemas import FragmentFolderInfo, FragmentItem, SpeakerSegmentItem


def _map_speaker_segments(raw: Optional[str]) -> Optional[list[SpeakerSegmentItem]]:
    """把说话人分段 JSON 规整为响应结构。"""
    parsed = parse_json_object_list(raw)
    if not parsed:
        return None
    normalized: list[SpeakerSegmentItem] = []
    for item in parsed:
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


def build_fragment_audio_file(fragment: Fragment) -> StoredFile | None:
    """从碎片模型恢复统一音频文件元数据。"""
    if not fragment.audio_object_key or not fragment.audio_storage_provider or not fragment.audio_bucket:
        return None
    return StoredFile(
        storage_provider=fragment.audio_storage_provider,
        bucket=fragment.audio_bucket,
        object_key=fragment.audio_object_key,
        access_level=fragment.audio_access_level or "private",
        original_filename=fragment.audio_original_filename or Path(fragment.audio_object_key).name,
        mime_type=fragment.audio_mime_type or "application/octet-stream",
        file_size=fragment.audio_file_size or 0,
        checksum=fragment.audio_checksum,
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


def map_fragment(fragment: Fragment, *, media_assets: list[MediaAsset] | None = None, file_storage: FileStorage | None = None) -> FragmentItem:
    """将碎片模型映射为含 HTML 正文的响应结构。"""
    folder = None
    if fragment.folder:
        folder = FragmentFolderInfo(id=fragment.folder.id, name=fragment.folder.name)
    body_html = read_fragment_body_html(fragment)
    audio_access = None
    if file_storage is not None:
        audio_file = build_fragment_audio_file(fragment)
        if audio_file is not None:
            audio_access = file_storage.create_download_url(audio_file)
    mapped_media_assets: list[MediaAssetItem] = []
    for item in media_assets or []:
        payload = map_media_asset(item)
        if file_storage is None:
            mapped_media_assets.append(payload)
            continue
        access = file_storage.create_download_url(build_media_asset_file(item))
        mapped_media_assets.append(MediaAssetItem(**payload.model_dump(), file_url=access.url, expires_at=access.expires_at))
    return FragmentItem(
        id=fragment.id,
        transcript=fragment.transcript,
        speaker_segments=_map_speaker_segments(fragment.speaker_segments),
        summary=fragment.summary,
        tags=parse_json_list(fragment.tags, allow_csv_fallback=True),
        source=fragment.source,
        audio_source=fragment.audio_source,
        created_at=format_iso_datetime(fragment.created_at),
        updated_at=format_iso_datetime(fragment.updated_at),
        audio_object_key=fragment.audio_object_key,
        audio_file_url=audio_access.url if audio_access else None,
        audio_file_expires_at=audio_access.expires_at if audio_access else None,
        folder_id=fragment.folder_id,
        folder=folder,
        body_html=body_html,
        plain_text_snapshot=read_fragment_plain_text(fragment) or None,
        content_state=resolve_fragment_content_state(fragment),
        media_assets=mapped_media_assets,
    )
