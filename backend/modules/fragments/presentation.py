from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from core import ResponseModel, success_response
from core.auth import get_current_user
from modules.shared.infrastructure.container import get_container, get_db_session, ServiceContainer

from .application import FragmentCommandService, FragmentQueryService
from .schemas import (
    FragmentItem,
    FragmentListResponse,
    FragmentTagListResponse,
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
    description="兼容读取后端 fragment projection 列表，可按文件夹和标签过滤。",
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
    description="兼容读取后端 fragment projection 详情。",
)
async def get_fragment(
    fragment_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
    service: FragmentCommandService = Depends(get_fragment_command_service),
):
    return success_response(data=service.get_fragment_payload(db=db, user_id=current_user["user_id"], fragment_id=fragment_id))

