from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from core import success_response
from core.auth import get_current_user
from modules.shared.container import get_container, get_db_session, ServiceContainer

from .application import FragmentCommandService, FragmentQueryService, map_fragment

router = APIRouter(prefix="/api/fragments", tags=["fragments"], responses={401: {"description": "未认证"}})


class FragmentCreateRequest(BaseModel):
    transcript: str | None = Field(None, description="转写文本")
    source: str = Field("voice", description="来源")
    audio_path: str | None = Field(None, description="音频路径")
    folder_id: str | None = Field(None, description="文件夹 ID")


class FragmentFolderUpdateRequest(BaseModel):
    folder_id: str | None = Field(..., description="文件夹 ID，传 null 表示移出文件夹")


class FragmentBatchMoveRequest(BaseModel):
    fragment_ids: list[str] = Field(..., min_length=1, max_length=100)
    folder_id: str | None = Field(..., description="目标文件夹 ID，传 null 表示移出文件夹")


class SimilarityQueryRequest(BaseModel):
    query_text: str
    top_k: int = Field(5, ge=1, le=20)
    exclude_ids: list[str] = Field(default_factory=list)


def get_fragment_command_service(container: ServiceContainer = Depends(get_container)) -> FragmentCommandService:
    return FragmentCommandService(audio_storage=container.audio_storage)


def get_fragment_query_service(container: ServiceContainer = Depends(get_container)) -> FragmentQueryService:
    return FragmentQueryService(vector_store=container.vector_store)


@router.get("")
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


@router.post("", status_code=status.HTTP_201_CREATED)
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
        source=data.source,
        audio_path=data.audio_path,
        folder_id=data.folder_id,
    )
    return success_response(data=map_fragment(fragment), message="碎片笔记创建成功")


@router.post("/similar")
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


@router.post("/move")
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


@router.get("/visualization")
async def get_fragment_visualization(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
    service: FragmentQueryService = Depends(get_fragment_query_service),
):
    return success_response(data=await service.visualization(db=db, user_id=current_user["user_id"]))


@router.get("/tags")
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


@router.get("/{fragment_id}")
async def get_fragment(
    fragment_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
    service: FragmentCommandService = Depends(get_fragment_command_service),
):
    return success_response(data=map_fragment(service.get_fragment(db=db, user_id=current_user["user_id"], fragment_id=fragment_id)))


@router.patch("/{fragment_id}")
async def update_fragment(
    fragment_id: str,
    data: FragmentFolderUpdateRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
    service: FragmentCommandService = Depends(get_fragment_command_service),
):
    fragment = service.update_fragment_folder(
        db=db,
        user_id=current_user["user_id"],
        fragment_id=fragment_id,
        folder_id=data.folder_id,
    )
    return success_response(data=map_fragment(fragment), message="碎片更新成功")


@router.delete("/{fragment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_fragment(
    fragment_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
    service: FragmentCommandService = Depends(get_fragment_command_service),
):
    service.delete_fragment(db=db, user_id=current_user["user_id"], fragment_id=fragment_id)
    return None
