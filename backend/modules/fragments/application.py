from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.orm import Session

from core.exceptions import NotFoundError, ValidationError
from models import Fragment
from utils.serialization import format_iso_datetime, parse_json_list, parse_json_object_list

from domains.fragment_folders import repository as fragment_folder_repository
from domains.fragment_tags import repository as fragment_tag_repository
from domains.fragments import repository as fragment_repository
from modules.shared.ports import AudioStorage, VectorStore
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


def map_fragment(fragment: Fragment) -> FragmentItem:
    folder = None
    if fragment.folder:
        folder = FragmentFolderInfo(id=fragment.folder.id, name=fragment.folder.name)
    return FragmentItem(
        id=fragment.id,
        transcript=fragment.transcript,
        speaker_segments=_map_speaker_segments(fragment.speaker_segments),
        summary=fragment.summary,
        tags=parse_json_list(fragment.tags, allow_csv_fallback=True),
        source=fragment.source,
        sync_status=fragment.sync_status,
        created_at=format_iso_datetime(fragment.created_at),
        audio_path=fragment.audio_path,
        folder_id=fragment.folder_id,
        folder=folder,
    )


class FragmentCommandService:
    def __init__(self, *, audio_storage: AudioStorage) -> None:
        self.audio_storage = audio_storage

    def create_fragment(
        self,
        *,
        db: Session,
        user_id: str,
        transcript: Optional[str],
        source: str,
        audio_path: Optional[str],
        folder_id: Optional[str] = None,
    ) -> Fragment:
        if source not in VALID_FRAGMENT_SOURCES:
            raise ValidationError(
                message="无效的 source 值",
                field_errors={"source": f"必须是以下之一: {', '.join(sorted(VALID_FRAGMENT_SOURCES))}"},
            )
        self._validate_folder_exists(db=db, user_id=user_id, folder_id=folder_id)
        return fragment_repository.create(
            db=db,
            user_id=user_id,
            transcript=transcript,
            source=source,
            audio_path=audio_path,
            sync_status="synced" if transcript else "pending",
            folder_id=folder_id,
        )

    def delete_fragment(self, *, db: Session, user_id: str, fragment_id: str) -> None:
        fragment = self.get_fragment(db=db, user_id=user_id, fragment_id=fragment_id)
        self.audio_storage.delete(fragment.audio_path)
        fragment_repository.delete(db=db, fragment=fragment)

    def update_fragment_folder(self, *, db: Session, user_id: str, fragment_id: str, folder_id: Optional[str]) -> Fragment:
        fragment = self.get_fragment(db=db, user_id=user_id, fragment_id=fragment_id)
        self._validate_folder_exists(db=db, user_id=user_id, folder_id=folder_id)
        return fragment_repository.update_folder(db=db, fragment=fragment, folder_id=folder_id)

    def move_fragments(self, *, db: Session, user_id: str, fragment_ids: list[str], folder_id: Optional[str]) -> FragmentBatchMoveResponse:
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
        return FragmentBatchMoveResponse(items=[map_fragment(fragment) for fragment in updated], moved_count=len(updated))

    def get_fragment(self, *, db: Session, user_id: str, fragment_id: str) -> Fragment:
        fragment = fragment_repository.get_by_id(db=db, user_id=user_id, fragment_id=fragment_id)
        if not fragment:
            raise NotFoundError(
                message="碎片笔记不存在或无权访问",
                resource_type="fragment",
                resource_id=fragment_id,
            )
        return fragment

    @staticmethod
    def _validate_folder_exists(db: Session, user_id: str, folder_id: Optional[str]) -> None:
        if folder_id is None:
            return
        folder = fragment_folder_repository.get_by_id(db=db, user_id=user_id, folder_id=folder_id)
        if not folder:
            raise NotFoundError(
                message="文件夹不存在或无权访问",
                resource_type="fragment_folder",
                resource_id=folder_id,
            )


class FragmentQueryService:
    def __init__(self, *, vector_store: VectorStore) -> None:
        self.vector_store = vector_store

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
        return FragmentListResponse(items=[map_fragment(item) for item in items], total=total, limit=limit, offset=offset)

    def list_tags(
        self,
        *,
        db: Session,
        user_id: str,
        query_text: Optional[str],
        limit: int,
    ) -> FragmentTagListResponse:
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
            mapped = map_fragment(fragment)
            items.append(
                SimilarFragmentItem(
                    **mapped.model_dump(),
                    score=float(match["score"]),
                    metadata=match["metadata"],
                )
            )
        return SimilarFragmentListResponse(items=items, total=len(items), query_text=query_text)

    async def visualization(self, *, db: Session, user_id: str) -> FragmentVisualizationResponse:
        return FragmentVisualizationResponse.model_validate(
            await build_fragment_visualization(db=db, user_id=user_id, vector_store=self.vector_store)
        )
