from __future__ import annotations

from collections import Counter
from typing import Optional

from sqlalchemy.orm import Session

from core.exceptions import NotFoundError
from domains.fragment_folders import repository as fragment_folder_repository
from modules.shared.fragment_snapshots import FragmentSnapshotReader
from modules.shared.media_asset_snapshots import MediaAssetSnapshotReader, map_media_asset_snapshot
from modules.shared.ports import FileStorage, VectorStore

from .mapper import map_fragment_snapshot
from .schemas import (
    FragmentItem,
    FragmentTagItem,
    FragmentTagListResponse,
    FragmentVisualizationResponse,
    SimilarFragmentItem,
    SimilarFragmentListResponse,
)
from .visualization import build_fragment_visualization

_FRAGMENT_SNAPSHOT_READER = FragmentSnapshotReader()
_MEDIA_ASSET_SNAPSHOT_READER = MediaAssetSnapshotReader()


def _normalize_fragment_tags(tags: list[str] | None) -> list[str]:
    """把单条 snapshot 上的标签规整为稳定去重列表。"""
    normalized: list[str] = []
    seen: set[str] = set()
    for raw in tags or []:
        tag = str(raw or "").strip()
        if not tag or tag in seen:
            continue
        seen.add(tag)
        normalized.append(tag[:50])
    return normalized


def _match_rank(*, tag: str, query_text: str | None) -> int:
    """保持旧接口的标签搜索排序：前缀优先，其次包含。"""
    if not query_text:
        return 0
    lowered_tag = tag.lower()
    lowered_query = query_text.lower()
    if lowered_tag.startswith(lowered_query):
        return 0
    if lowered_query in lowered_tag:
        return 1
    return 2


class FragmentCommandService:
    """封装 fragment snapshot 的只读详情能力，供导出链路复用。"""

    def __init__(self, *, file_storage: FileStorage, **_: object) -> None:
        """装配 snapshot 详情读取所需依赖。"""
        self.file_storage = file_storage

    def get_fragment_payload(self, *, db: Session, user_id: str, fragment_id: str) -> FragmentItem:
        """读取单条 fragment snapshot，并补齐素材访问地址。"""
        snapshot = _FRAGMENT_SNAPSHOT_READER.get_by_id(
            db=db,
            user_id=user_id,
            fragment_id=fragment_id,
        )
        if snapshot is None:
            raise NotFoundError(
                message="碎片笔记不存在或无权访问",
                resource_type="fragment",
                resource_id=fragment_id,
            )
        media_assets = [
            map_media_asset_snapshot(item, file_storage=self.file_storage)
            for item in _MEDIA_ASSET_SNAPSHOT_READER.list_by_fragment_id(
                db=db,
                user_id=user_id,
                fragment_id=fragment_id,
            )
        ]
        folder = None
        if snapshot.folder_id:
            folder_row = fragment_folder_repository.get_by_id(db=db, user_id=user_id, folder_id=snapshot.folder_id)
            if folder_row is not None:
                from .schemas import FragmentFolderInfo

                folder = FragmentFolderInfo(id=folder_row.id, name=folder_row.name)
        return map_fragment_snapshot(snapshot, media_assets=media_assets, folder=folder)

    def export_fragment_markdown(self, *, db: Session, user_id: str, fragment_id: str) -> FragmentItem:
        """导出前复用详情读取结果，避免多套 fragment 组装逻辑漂移。"""
        return self.get_fragment_payload(db=db, user_id=user_id, fragment_id=fragment_id)


class FragmentQueryService:
    """封装基于 snapshot 的 fragment 读操作。"""

    def __init__(self, *, vector_store: VectorStore, file_storage: FileStorage) -> None:
        """装配读操作依赖；file_storage 保留给兼容构造函数与后续扩展。"""
        self.vector_store = vector_store
        self.file_storage = file_storage

    def list_tags(
        self,
        *,
        db: Session,
        user_id: str,
        query_text: Optional[str],
        limit: int,
    ) -> FragmentTagListResponse:
        """扫描 fragment snapshot 标签并返回聚合统计。"""
        normalized_query = str(query_text or "").strip() or None
        counter: Counter[str] = Counter()
        for payload in _FRAGMENT_SNAPSHOT_READER.list_raw_payloads(db=db, user_id=user_id):
            unique_tags = _normalize_fragment_tags(payload.get("tags") if isinstance(payload.get("tags"), list) else [])
            for tag in unique_tags:
                if normalized_query and normalized_query.lower() not in tag.lower():
                    continue
                counter[tag] += 1
        ordered_tags = sorted(
            counter.items(),
            key=lambda item: (_match_rank(tag=item[0], query_text=normalized_query), -item[1], item[0]),
        )[:limit]
        return FragmentTagListResponse(
            items=[FragmentTagItem(tag=tag, fragment_count=count) for tag, count in ordered_tags],
            total=len(ordered_tags),
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
