from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from core.exceptions import NotFoundError, ValidationError
from models import Fragment

from domains.fragment_folders import repository as fragment_folder_repository
from domains.fragment_tags import repository as fragment_tag_repository
from domains.fragments import repository as fragment_repository
from domains.media_assets import repository as media_asset_repository
from modules.shared.content.content_html import (
    extract_plain_text_from_html,
    normalize_body_html,
)
from modules.shared.fragment_snapshots import FragmentSnapshotReader
from modules.shared.ports import FileStorage, StoredFile, TextGenerationProvider, VectorStore

from .asset_binding_service import FragmentAssetBindingService
from .content_service import FragmentContentService
from .derivative_service import FragmentDerivativeService
from .mapper import build_fragment_audio_file, map_fragment, map_fragment_snapshot
from .schemas import (
    FragmentBatchMoveResponse,
    FragmentItem,
    FragmentListResponse,
    FragmentTagItem,
    FragmentTagListResponse,
    FragmentVisualizationResponse,
    SimilarFragmentItem,
    SimilarFragmentListResponse,
)
from .visualization import build_fragment_visualization

VALID_FRAGMENT_SOURCES = {"voice", "manual", "video_parse"}
VALID_AUDIO_SOURCES = {"upload", "external_link"}
_FRAGMENT_SNAPSHOT_READER = FragmentSnapshotReader()


class FragmentCommandService:
    """封装碎片写操作编排。"""

    def __init__(self, *, file_storage: FileStorage, vector_store: VectorStore, llm_provider: TextGenerationProvider) -> None:
        """装配碎片写操作依赖与内部子服务。"""
        self.file_storage = file_storage
        self.asset_binding_service = FragmentAssetBindingService()
        self.content_service = FragmentContentService()
        self.derivative_service = FragmentDerivativeService(vector_store=vector_store, llm_provider=llm_provider)

    def create_fragment(
        self,
        *,
        db: Session,
        user_id: str,
        transcript: Optional[str],
        body_html: str | None,
        source: str,
        audio_source: Optional[str],
        audio_file: StoredFile | None,
        folder_id: Optional[str] = None,
        media_asset_ids: list[str] | None = None,
    ) -> Fragment:
        """创建碎片，并按需初始化 HTML 正文和素材关联。"""
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
        normalized_body_html = normalize_body_html(body_html)
        plain_text_snapshot = extract_plain_text_from_html(normalized_body_html)
        normalized_transcript = self._normalize_transcript(transcript=transcript, source=source)
        fragment = fragment_repository.create(
            db=db,
            user_id=user_id,
            transcript=normalized_transcript,
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
            body_html=normalized_body_html,
            plain_text_snapshot=plain_text_snapshot,
            folder_id=folder_id,
            tags=[],
        )
        merged_asset_ids = self._merge_media_asset_ids(
            media_asset_ids=media_asset_ids,
            document_asset_ids=self.content_service.collect_body_asset_ids(body_html=normalized_body_html),
        )
        if merged_asset_ids:
            self.asset_binding_service.attach_media_assets(
                db=db,
                user_id=user_id,
                content_type="fragment",
                content_id=fragment.id,
                media_asset_ids=merged_asset_ids,
            )
        self.content_service.create_initial_content(db=db, fragment=fragment, body_html=normalized_body_html)
        return fragment

    def create_fragment_with_content(
        self,
        *,
        db: Session,
        user_id: str,
        transcript: Optional[str],
        body_html: str | None,
        source: str,
        audio_source: Optional[str],
        audio_file: StoredFile | None,
        folder_id: Optional[str] = None,
        media_asset_ids: list[str] | None = None,
    ) -> Fragment:
        """创建碎片并返回完整正文与素材载荷。"""
        fragment = self.create_fragment(
            db=db,
            user_id=user_id,
            transcript=transcript,
            body_html=body_html,
            source=source,
            audio_source=audio_source,
            audio_file=audio_file,
            folder_id=folder_id,
            media_asset_ids=media_asset_ids,
        )
        return self.get_fragment(db=db, user_id=user_id, fragment_id=fragment.id)

    def delete_fragment(self, *, db: Session, user_id: str, fragment_id: str) -> None:
        """删除碎片及关联音频文件。"""
        fragment = self.get_fragment(db=db, user_id=user_id, fragment_id=fragment_id)
        self.file_storage.delete(build_fragment_audio_file(fragment))
        fragment_repository.delete(db=db, fragment=fragment)

    def update_fragment_folder(self, *, db: Session, user_id: str, fragment_id: str, folder_id: Optional[str]) -> Fragment:
        """仅更新碎片文件夹归属。"""
        fragment = self.get_fragment(db=db, user_id=user_id, fragment_id=fragment_id)
        self._validate_folder_exists(db=db, user_id=user_id, folder_id=folder_id)
        return fragment_repository.update_folder(db=db, fragment=fragment, folder_id=folder_id)

    async def update_fragment(
        self,
        *,
        db: Session,
        user_id: str,
        fragment_id: str,
        folder_id: Optional[str] = None,
        folder_id_provided: bool = False,
        body_html: str | None = None,
        media_asset_ids: list[str] | None = None,
    ) -> Fragment:
        """更新碎片正文、文件夹和素材绑定。"""
        fragment = self.get_fragment(db=db, user_id=user_id, fragment_id=fragment_id)
        previous_effective_text = self.content_service.read_effective_text(fragment)
        if folder_id_provided:
            self._validate_folder_exists(db=db, user_id=user_id, folder_id=folder_id)
            fragment = fragment_repository.update_folder(db=db, fragment=fragment, folder_id=folder_id)
        merged_asset_ids = media_asset_ids
        if body_html is not None:
            self.content_service.replace_content(db=db, fragment=fragment, body_html=body_html)
            merged_asset_ids = self._merge_media_asset_ids(
                media_asset_ids=media_asset_ids,
                document_asset_ids=self.content_service.collect_body_asset_ids(body_html=body_html),
            )
        if media_asset_ids is not None:
            self.asset_binding_service.replace_media_assets(
                db=db,
                user_id=user_id,
                content_type="fragment",
                content_id=fragment.id,
                media_asset_ids=merged_asset_ids or [],
            )
        updated_fragment = self.get_fragment(db=db, user_id=user_id, fragment_id=fragment_id)
        if body_html is not None:
            await self.derivative_service.refresh_fragment_derivatives(
                db=db,
                user_id=user_id,
                fragment=updated_fragment,
                previous_effective_text=previous_effective_text,
                current_effective_text=self.content_service.read_effective_text(updated_fragment),
            )
            updated_fragment = self.get_fragment(db=db, user_id=user_id, fragment_id=fragment_id)
        return updated_fragment

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
    def _normalize_transcript(*, transcript: Optional[str], source: str) -> str | None:
        """根据来源约束是否保留转写原文。"""
        normalized_transcript = (transcript or "").strip() or None
        if source != "voice":
            return None
        return normalized_transcript

    @staticmethod
    def _merge_media_asset_ids(*, media_asset_ids: list[str] | None, document_asset_ids: list[str]) -> list[str]:
        """把显式绑定素材和正文内嵌图片素材去重合并。"""
        merged: list[str] = []
        for asset_id in (media_asset_ids or []) + document_asset_ids:
            normalized = str(asset_id or "").strip()
            if normalized and normalized not in merged:
                merged.append(normalized)
        return merged


class FragmentQueryService:
    """封装碎片读操作。"""

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
        fragments = _FRAGMENT_SNAPSHOT_READER.get_by_ids(
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
            mapped = map_fragment_snapshot(fragment)
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
