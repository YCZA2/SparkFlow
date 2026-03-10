from __future__ import annotations

from pathlib import Path
from typing import Any, Optional

from sqlalchemy.orm import Session

from core.exceptions import NotFoundError, ValidationError
from models import Fragment, MediaAsset
from utils.serialization import format_iso_datetime, parse_json_list, parse_json_object_list

from domains.fragment_blocks import repository as fragment_block_repository
from domains.fragment_folders import repository as fragment_folder_repository
from domains.fragment_tags import repository as fragment_tag_repository
from domains.fragments import repository as fragment_repository
from domains.media_assets import repository as media_asset_repository
from modules.shared.content_markdown import (
    MARKDOWN_BLOCK_TYPE,
    build_markdown_block_payload,
    compile_fragment_markdown,
    extract_plain_text,
    parse_markdown_block_payload,
)
from modules.shared.content_schemas import FragmentBlockInput, FragmentBlockItem, MediaAssetItem
from modules.shared.ports import FileStorage, StoredFile, VectorStore
from .schemas import (
    FragmentBatchMoveResponse,
    FragmentFolderInfo,
    FragmentItem,
    FragmentListResponse,
    FragmentTagItem,
    FragmentTagListResponse,
    FragmentVisualizationResponse,
    SimilarFragmentItem,
    SimilarFragmentListResponse,
    SpeakerSegmentItem,
)
from .visualization import build_fragment_visualization

VALID_FRAGMENT_SOURCES = {"voice", "manual", "video_parse"}
VALID_AUDIO_SOURCES = {"upload", "external_link"}
VALID_FRAGMENT_BLOCK_TYPES = {MARKDOWN_BLOCK_TYPE}


def _map_speaker_segments(raw: Optional[str]) -> Optional[list[SpeakerSegmentItem]]:
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


def _build_fragment_audio_file(fragment: Fragment) -> StoredFile | None:
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


def _build_media_asset_file(asset: MediaAsset) -> StoredFile:
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


def _map_blocks(fragment: Fragment) -> list[FragmentBlockItem]:
    """把 ORM 块记录转换为统一块响应。"""
    blocks: list[FragmentBlockItem] = []
    for block in sorted(fragment.blocks, key=lambda item: item.order_index):
        blocks.append(
            FragmentBlockItem(
                id=block.id,
                type=block.block_type,
                order_index=block.order_index,
                markdown=parse_markdown_block_payload(block.payload_json) if block.block_type == MARKDOWN_BLOCK_TYPE else None,
            )
        )
    return blocks


def _resolve_content_state(*, blocks: list[FragmentBlockItem]) -> str:
    """根据当前内容层状态给出稳定枚举。"""
    if blocks:
        return "blocks_present"
    return "empty"


def map_fragment(fragment: Fragment, *, media_assets: list[MediaAsset] | None = None, file_storage: FileStorage | None = None) -> FragmentItem:
    """将碎片模型映射为含 Markdown 内容层的响应结构。"""
    folder = None
    if fragment.folder:
        folder = FragmentFolderInfo(id=fragment.folder.id, name=fragment.folder.name)
    blocks = _map_blocks(fragment)
    compiled_markdown = compile_fragment_markdown(
        block_payloads=[block.payload_json for block in sorted(fragment.blocks, key=lambda item: item.order_index)],
    )
    audio_access = None
    if file_storage is not None:
        audio_file = _build_fragment_audio_file(fragment)
        if audio_file is not None:
            audio_access = file_storage.create_download_url(audio_file)
    mapped_media_assets: list[MediaAssetItem] = []
    for item in media_assets or []:
        payload = map_media_asset(item)
        if file_storage is None:
            mapped_media_assets.append(payload)
            continue
        access = file_storage.create_download_url(_build_media_asset_file(item))
        mapped_media_assets.append(MediaAssetItem(**payload.model_dump(), file_url=access.url, expires_at=access.expires_at))
    return FragmentItem(
        id=fragment.id,
        capture_text=fragment.capture_text,
        transcript=fragment.transcript,
        speaker_segments=_map_speaker_segments(fragment.speaker_segments),
        summary=fragment.summary,
        tags=parse_json_list(fragment.tags, allow_csv_fallback=True),
        source=fragment.source,
        audio_source=fragment.audio_source,
        created_at=format_iso_datetime(fragment.created_at),
        audio_file_url=audio_access.url if audio_access else None,
        audio_file_expires_at=audio_access.expires_at if audio_access else None,
        folder_id=fragment.folder_id,
        folder=folder,
        blocks=blocks,
        compiled_markdown=compiled_markdown or None,
        content_state=_resolve_content_state(blocks=blocks),
        media_assets=mapped_media_assets,
    )


class FragmentCommandService:
    def __init__(self, *, file_storage: FileStorage) -> None:
        """装配碎片写操作依赖。"""
        self.file_storage = file_storage

    def create_fragment(
        self,
        *,
        db: Session,
        user_id: str,
        transcript: Optional[str],
        capture_text: Optional[str],
        body_markdown: Optional[str],
        source: str,
        audio_source: Optional[str],
        audio_file: StoredFile | None,
        folder_id: Optional[str] = None,
        media_asset_ids: list[str] | None = None,
    ) -> Fragment:
        """创建碎片，并按需初始化 Markdown 块和素材关联。"""
        if source not in VALID_FRAGMENT_SOURCES:
            raise ValidationError(
                message="无效的 source 值",
                field_errors={"source": f"必须是以下之一: {', '.join(sorted(VALID_FRAGMENT_SOURCES))}"},
            )
        if audio_source is not None and audio_source not in VALID_AUDIO_SOURCES:
            raise ValidationError(
                message="无效的 audio_source 值",
                field_errors={"audio_source": f"必须是以下之一: {', '.join(sorted(VALID_AUDIO_SOURCES))}"},
            )
        self._validate_folder_exists(db=db, user_id=user_id, folder_id=folder_id)
        normalized_body = (body_markdown or "").strip() or None
        normalized_capture_source = capture_text or transcript or extract_plain_text(normalized_body)
        normalized_capture = normalized_capture_source.strip() if normalized_capture_source else None
        if normalized_capture == "":
            normalized_capture = None
        normalized_transcript = (transcript or normalized_capture or "").strip() or None
        fragment = fragment_repository.create(
            db=db,
            user_id=user_id,
            transcript=normalized_transcript,
            capture_text=normalized_capture,
            source=source,
            audio_source=audio_source,
            audio_storage_provider=audio_file.storage_provider if audio_file else None,
            audio_bucket=audio_file.bucket if audio_file else None,
            audio_object_key=audio_file.object_key if audio_file else None,
            audio_access_level=audio_file.access_level if audio_file else None,
            audio_original_filename=audio_file.original_filename if audio_file else None,
            audio_mime_type=audio_file.mime_type if audio_file else None,
            audio_file_size=audio_file.file_size if audio_file else None,
            audio_checksum=audio_file.checksum if audio_file else None,
            folder_id=folder_id,
            tags=[],
        )
        if media_asset_ids:
            self._attach_media_assets(
                db=db,
                user_id=user_id,
                content_type="fragment",
                content_id=fragment.id,
                media_asset_ids=media_asset_ids,
            )
        return fragment

    def create_fragment_with_content(
        self,
        *,
        db: Session,
        user_id: str,
        transcript: Optional[str],
        capture_text: Optional[str],
        body_markdown: Optional[str],
        source: str,
        audio_source: Optional[str],
        audio_file: StoredFile | None,
        folder_id: Optional[str] = None,
        media_asset_ids: list[str] | None = None,
    ) -> Fragment:
        """创建碎片并补齐 Markdown 块与素材关联。"""
        fragment = self.create_fragment(
            db=db,
            user_id=user_id,
            transcript=transcript,
            capture_text=capture_text,
            body_markdown=body_markdown,
            source=source,
            audio_source=audio_source,
            audio_file=audio_file,
            folder_id=folder_id,
            media_asset_ids=media_asset_ids,
        )
        normalized_body = (body_markdown or "").strip()
        if normalized_body:
            fragment_block_repository.create_markdown_block(
                db=db,
                fragment_id=fragment.id,
                order_index=0,
                payload_json=build_markdown_block_payload(normalized_body),
            )
            fragment = self.get_fragment(db=db, user_id=user_id, fragment_id=fragment.id)
        if media_asset_ids:
            self._attach_media_assets(
                db=db,
                user_id=user_id,
                content_type="fragment",
                content_id=fragment.id,
                media_asset_ids=media_asset_ids,
            )
        return self.get_fragment(db=db, user_id=user_id, fragment_id=fragment.id)

    def delete_fragment(self, *, db: Session, user_id: str, fragment_id: str) -> None:
        """删除碎片及关联音频文件。"""
        fragment = self.get_fragment(db=db, user_id=user_id, fragment_id=fragment_id)
        self.file_storage.delete(_build_fragment_audio_file(fragment))
        fragment_repository.delete(db=db, fragment=fragment)

    def update_fragment_folder(self, *, db: Session, user_id: str, fragment_id: str, folder_id: Optional[str]) -> Fragment:
        """仅更新碎片文件夹归属。"""
        fragment = self.get_fragment(db=db, user_id=user_id, fragment_id=fragment_id)
        self._validate_folder_exists(db=db, user_id=user_id, folder_id=folder_id)
        return fragment_repository.update_folder(db=db, fragment=fragment, folder_id=folder_id)

    def update_fragment(
        self,
        *,
        db: Session,
        user_id: str,
        fragment_id: str,
        folder_id: Optional[str] = None,
        folder_id_provided: bool = False,
        body_markdown: str | None = None,
        blocks: list[FragmentBlockInput] | None = None,
        media_asset_ids: list[str] | None = None,
    ) -> Fragment:
        """更新碎片内容块、文件夹和素材绑定。"""
        fragment = self.get_fragment(db=db, user_id=user_id, fragment_id=fragment_id)
        if folder_id_provided:
            self._validate_folder_exists(db=db, user_id=user_id, folder_id=folder_id)
            fragment = fragment_repository.update_folder(db=db, fragment=fragment, folder_id=folder_id)
        if body_markdown is not None or blocks is not None:
            markdown_contents = self._normalize_markdown_blocks(
                blocks=blocks,
                body_markdown=body_markdown,
            )
            fragment_block_repository.replace_markdown_blocks(
                db=db,
                fragment_id=fragment.id,
                markdown_contents=[build_markdown_block_payload(item) for item in markdown_contents],
            )
        if media_asset_ids is not None:
            self._replace_media_assets(
                db=db,
                user_id=user_id,
                content_type="fragment",
                content_id=fragment.id,
                media_asset_ids=media_asset_ids,
            )
        return self.get_fragment(db=db, user_id=user_id, fragment_id=fragment_id)

    def move_fragments(self, *, db: Session, user_id: str, fragment_ids: list[str], folder_id: Optional[str]) -> FragmentBatchMoveResponse:
        """批量移动碎片到目标文件夹。"""
        self._validate_folder_exists(db=db, user_id=user_id, folder_id=folder_id)
        fragments = fragment_repository.get_by_ids(db=db, user_id=user_id, fragment_ids=fragment_ids)
        found_ids = {fragment.id for fragment in fragments}
        missing_ids = sorted(set(fragment_ids) - found_ids)
        if missing_ids:
            raise NotFoundError(
                message=f"部分碎片不存在或无权访问: {', '.join(missing_ids)}",
                resource_type="fragment",
                resource_id=",".join(missing_ids),
            )
        updated = fragment_repository.move_by_ids(db=db, fragments=fragments, folder_id=folder_id)
        return FragmentBatchMoveResponse(items=[map_fragment(fragment, file_storage=self.file_storage) for fragment in updated], moved_count=len(updated))

    def get_fragment(self, *, db: Session, user_id: str, fragment_id: str) -> Fragment:
        """读取单条碎片并在找不到时抛出统一异常。"""
        fragment = fragment_repository.get_by_id(db=db, user_id=user_id, fragment_id=fragment_id)
        if not fragment:
            raise NotFoundError(
                message="碎片笔记不存在或无权访问",
                resource_type="fragment",
                resource_id=fragment_id,
            )
        return fragment

    def get_fragment_payload(self, *, db: Session, user_id: str, fragment_id: str) -> FragmentItem:
        """读取带素材信息的碎片详情。"""
        fragment = self.get_fragment(db=db, user_id=user_id, fragment_id=fragment_id)
        media_assets = media_asset_repository.list_content_assets(
            db=db,
            user_id=user_id,
            content_type="fragment",
            content_id=fragment.id,
        )
        return map_fragment(fragment, media_assets=media_assets, file_storage=self.file_storage)

    def export_fragment_markdown(self, *, db: Session, user_id: str, fragment_id: str) -> FragmentItem:
        """导出前复用带完整内容层的详情载荷。"""
        return self.get_fragment_payload(db=db, user_id=user_id, fragment_id=fragment_id)

    @staticmethod
    def _validate_folder_exists(db: Session, user_id: str, folder_id: Optional[str]) -> None:
        """校验目标文件夹存在且属于当前用户。"""
        if folder_id is None:
            return
        folder = fragment_folder_repository.get_by_id(db=db, user_id=user_id, folder_id=folder_id)
        if not folder:
            raise NotFoundError(
                message="文件夹不存在或无权访问",
                resource_type="fragment_folder",
                resource_id=folder_id,
            )

    @staticmethod
    def _normalize_markdown_blocks(
        *,
        blocks: list[FragmentBlockInput] | None,
        body_markdown: str | None,
    ) -> list[str]:
        """把块更新请求规整为 Markdown 文本列表。"""
        if blocks is not None:
            markdown_contents: list[str] = []
            for block in blocks:
                if block.type not in VALID_FRAGMENT_BLOCK_TYPES:
                    raise ValidationError(message="暂不支持的碎片块类型", field_errors={"blocks": "当前仅支持 markdown"})
                markdown_contents.append((block.markdown or "").strip())
            return markdown_contents
        if body_markdown is not None:
            normalized = body_markdown.strip()
            return [normalized]
        return []

    @staticmethod
    def _attach_media_assets(
        *,
        db: Session,
        user_id: str,
        content_type: str,
        content_id: str,
        media_asset_ids: list[str],
    ) -> None:
        """把素材资源挂到指定内容对象。"""
        for media_asset_id in media_asset_ids:
            asset = media_asset_repository.get_by_id(db=db, user_id=user_id, asset_id=media_asset_id)
            if not asset:
                raise NotFoundError(message="媒体资源不存在或无权访问", resource_type="media_asset", resource_id=media_asset_id)
            media_asset_repository.attach_to_content(
                db=db,
                user_id=user_id,
                media_asset_id=media_asset_id,
                content_type=content_type,
                content_id=content_id,
            )

    @classmethod
    def _replace_media_assets(
        cls,
        *,
        db: Session,
        user_id: str,
        content_type: str,
        content_id: str,
        media_asset_ids: list[str],
    ) -> None:
        """重建内容对象上的素材关联列表。"""
        current_assets = media_asset_repository.list_content_assets(
            db=db,
            user_id=user_id,
            content_type=content_type,
            content_id=content_id,
        )
        current_ids = {item.id for item in current_assets}
        target_ids = list(dict.fromkeys(media_asset_ids))
        for media_asset_id in current_ids - set(target_ids):
            media_asset_repository.detach_from_content(
                db=db,
                user_id=user_id,
                content_type=content_type,
                content_id=content_id,
                media_asset_id=media_asset_id,
            )
        cls._attach_media_assets(
            db=db,
            user_id=user_id,
            content_type=content_type,
            content_id=content_id,
            media_asset_ids=target_ids,
        )


class FragmentQueryService:
    def __init__(self, *, vector_store: VectorStore, file_storage: FileStorage) -> None:
        """装配碎片读操作依赖。"""
        self.vector_store = vector_store
        self.file_storage = file_storage

    def list_fragments(
        self,
        *,
        db: Session,
        user_id: str,
        limit: int,
        offset: int,
        folder_id: Optional[str] = None,
        tag: Optional[str] = None,
    ) -> FragmentListResponse:
        """分页返回碎片列表。"""
        normalized_tag = str(tag or "").strip() or None
        if folder_id is not None:
            folder = fragment_folder_repository.get_by_id(db=db, user_id=user_id, folder_id=folder_id)
            if not folder:
                raise NotFoundError(
                    message="文件夹不存在或无权访问",
                    resource_type="fragment_folder",
                    resource_id=folder_id,
                )
        items = fragment_repository.list_by_user(
            db=db,
            user_id=user_id,
            limit=limit,
            offset=offset,
            folder_id=folder_id,
            tag=normalized_tag,
        )
        total = fragment_repository.count_by_user(
            db=db,
            user_id=user_id,
            folder_id=folder_id,
            tag=normalized_tag,
        )
        return FragmentListResponse(items=[map_fragment(item, file_storage=self.file_storage) for item in items], total=total, limit=limit, offset=offset)

    def list_tags(
        self,
        *,
        db: Session,
        user_id: str,
        query_text: Optional[str],
        limit: int,
    ) -> FragmentTagListResponse:
        """返回当前用户的标签聚合结果。"""
        normalized_query = str(query_text or "").strip() or None
        items = fragment_tag_repository.list_tag_stats(
            db=db,
            user_id=user_id,
            query_text=normalized_query,
            limit=limit,
        )
        return FragmentTagListResponse(
            items=[FragmentTagItem.model_validate(item) for item in items],
            total=len(items),
            query_text=normalized_query,
        )

    async def query_similar(
        self,
        *,
        db: Session,
        user_id: str,
        query_text: str,
        top_k: int,
        exclude_ids: Optional[list[str]],
    ) -> SimilarFragmentListResponse:
        """基于向量结果拼装相似碎片响应。"""
        matches = await self.vector_store.query_fragments(
            user_id=user_id,
            query_text=query_text,
            top_k=top_k,
            exclude_ids=exclude_ids,
        )
        fragments = fragment_repository.get_by_ids(
            db=db,
            user_id=user_id,
            fragment_ids=[item["fragment_id"] for item in matches],
        )
        fragment_map = {fragment.id: fragment for fragment in fragments}
        items: list[SimilarFragmentItem] = []
        for match in matches:
            fragment = fragment_map.get(match["fragment_id"])
            if not fragment:
                continue
            mapped = map_fragment(fragment, file_storage=self.file_storage)
            items.append(
                SimilarFragmentItem(
                    **mapped.model_dump(),
                    score=float(match["score"]),
                    metadata=match["metadata"],
                )
            )
        return SimilarFragmentListResponse(items=items, total=len(items), query_text=query_text)

    async def visualization(self, *, db: Session, user_id: str) -> FragmentVisualizationResponse:
        """构建碎片云图可视化数据。"""
        return FragmentVisualizationResponse.model_validate(
            await build_fragment_visualization(db=db, user_id=user_id, vector_store=self.vector_store)
        )
