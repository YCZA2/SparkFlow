from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from core import ResponseModel, success_response
from core.auth import get_current_user
from modules.shared.container import get_container, get_db_session, ServiceContainer

from .application import FragmentCommandService, FragmentQueryService
from .schemas import (
    FragmentBatchMoveRequest,
    FragmentBatchMoveResponse,
    FragmentCreateRequest,
    FragmentItem,
    FragmentListResponse,
    FragmentTagListResponse,
    FragmentUpdateRequest,
    FragmentVisualizationResponse,
    SimilarityQueryRequest,
    SimilarFragmentListResponse,
)

router = APIRouter(prefix="/api/fragments", tags=["fragments"], responses={401: {"description": "未认证"}})

def get_fragment_command_service(container: ServiceContainer = Depends(get_container)) -> FragmentCommandService:
    return FragmentCommandService(
        file_storage=container.file_storage,
        vector_store=container.vector_store,
        llm_provider=container.llm_provider,
    )


def get_fragment_query_service(container: ServiceContainer = Depends(get_container)) -> FragmentQueryService:
    return FragmentQueryService(vector_store=container.vector_store, file_storage=container.file_storage)


@router.get(
    "",
    response_model=ResponseModel[FragmentListResponse],
    summary="获取碎片列表",
    description="按分页返回当前用户的碎片列表，可按文件夹和标签过滤。",
)
async def list_fragments(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    folder_id: str | None = Query(None),
    tag: str | None = Query(None),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
    service: FragmentQueryService = Depends(get_fragment_query_service),
):
    return success_response(
        data=service.list_fragments(
            db=db,
            user_id=current_user["user_id"],
            limit=limit,
            offset=offset,
            folder_id=folder_id,
            tag=tag,
        )
    )


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=ResponseModel[FragmentItem],
    summary="创建碎片",
    description="创建一条文本碎片记录，适用于手动录入或外部导入后的碎片落库。",
)
async def create_fragment(
    data: FragmentCreateRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
    service: FragmentCommandService = Depends(get_fragment_command_service),
):
    fragment = service.create_fragment(
        db=db,
        user_id=current_user["user_id"],
        transcript=data.transcript,
        body_markdown=data.body_markdown,
        source=data.source,
        audio_source=data.audio_source,
        audio_file=None,
        folder_id=data.folder_id,
        media_asset_ids=data.media_asset_ids,
    )
    return success_response(data=service.get_fragment_payload(db=db, user_id=current_user["user_id"], fragment_id=fragment.id), message="碎片笔记创建成功")


@router.post(
    "/content",
    status_code=status.HTTP_201_CREATED,
    response_model=ResponseModel[FragmentItem],
    summary="创建带 Markdown 内容的碎片",
    description="创建一条可编辑内容碎片，并在首次落库时初始化 Markdown 块。",
)
async def create_fragment_with_content(
    data: FragmentCreateRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
    service: FragmentCommandService = Depends(get_fragment_command_service),
):
    fragment = service.create_fragment_with_content(
        db=db,
        user_id=current_user["user_id"],
        transcript=data.transcript,
        body_markdown=data.body_markdown,
        source=data.source,
        audio_source=data.audio_source,
        audio_file=None,
        folder_id=data.folder_id,
        media_asset_ids=data.media_asset_ids,
    )
    return success_response(data=service.get_fragment_payload(db=db, user_id=current_user["user_id"], fragment_id=fragment.id), message="碎片笔记创建成功")


@router.post(
    "/similar",
    response_model=ResponseModel[SimilarFragmentListResponse],
    summary="检索相似碎片",
    description="基于语义向量查询与输入文本最相似的碎片，可排除指定碎片 ID。",
)
async def query_similar_fragments(
    data: SimilarityQueryRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
    service: FragmentQueryService = Depends(get_fragment_query_service),
):
    return success_response(
        data=await service.query_similar(
            db=db,
            user_id=current_user["user_id"],
            query_text=data.query_text,
            top_k=data.top_k,
            exclude_ids=data.exclude_ids,
        )
    )


@router.post(
    "/move",
    response_model=ResponseModel[FragmentBatchMoveResponse],
    summary="批量移动碎片",
    description="将多条碎片批量移动到目标文件夹，传入 null 可将碎片移出文件夹。",
)
async def move_fragments(
    data: FragmentBatchMoveRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
    service: FragmentCommandService = Depends(get_fragment_command_service),
):
    return success_response(
        data=service.move_fragments(
            db=db,
            user_id=current_user["user_id"],
            fragment_ids=data.fragment_ids,
            folder_id=data.folder_id,
        ),
        message="碎片移动成功",
    )


@router.get(
    "/visualization",
    response_model=ResponseModel[FragmentVisualizationResponse],
    summary="获取碎片云图数据",
    description="返回碎片向量降维和聚类后的可视化点位、簇信息与统计摘要。",
)
async def get_fragment_visualization(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
    service: FragmentQueryService = Depends(get_fragment_query_service),
):
    return success_response(data=await service.visualization(db=db, user_id=current_user["user_id"]))


@router.get(
    "/tags",
    response_model=ResponseModel[FragmentTagListResponse],
    summary="获取标签列表",
    description="返回当前用户碎片标签的统计结果，可按关键字搜索标签。",
)
async def list_fragment_tags(
    query: str | None = Query(None),
    limit: int = Query(20, ge=1, le=50),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
    service: FragmentQueryService = Depends(get_fragment_query_service),
):
    return success_response(
        data=service.list_tags(
            db=db,
            user_id=current_user["user_id"],
            query_text=query,
            limit=limit,
        )
    )


@router.get(
    "/{fragment_id}",
    response_model=ResponseModel[FragmentItem],
    summary="获取碎片详情",
    description="根据碎片 ID 返回单条碎片的完整信息。",
)
async def get_fragment(
    fragment_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
    service: FragmentCommandService = Depends(get_fragment_command_service),
):
    return success_response(data=service.get_fragment_payload(db=db, user_id=current_user["user_id"], fragment_id=fragment_id))


@router.patch(
    "/{fragment_id}",
    response_model=ResponseModel[FragmentItem],
    summary="更新碎片文件夹",
    description="更新单条碎片的归属文件夹，传入 null 表示移出文件夹。",
)
async def update_fragment(
    fragment_id: str,
    data: FragmentUpdateRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
    service: FragmentCommandService = Depends(get_fragment_command_service),
):
    payload = data.model_dump(exclude_unset=True)
    fragment = await service.update_fragment(
        db=db,
        user_id=current_user["user_id"],
        fragment_id=fragment_id,
        folder_id=payload.get("folder_id"),
        folder_id_provided="folder_id" in payload,
        body_markdown=payload.get("body_markdown"),
        blocks=data.blocks if "blocks" in payload else None,
        media_asset_ids=payload.get("media_asset_ids"),
    )
    return success_response(data=service.get_fragment_payload(db=db, user_id=current_user["user_id"], fragment_id=fragment_id), message="碎片更新成功")


@router.delete(
    "/{fragment_id}",
    response_model=ResponseModel[None],
    summary="删除碎片",
    description="删除指定碎片，并尝试清理关联的本地音频文件。",
)
async def delete_fragment(
    fragment_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
    service: FragmentCommandService = Depends(get_fragment_command_service),
):
    service.delete_fragment(db=db, user_id=current_user["user_id"], fragment_id=fragment_id)
    return success_response(data=None, message="碎片删除成功")
