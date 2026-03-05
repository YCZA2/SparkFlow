"""
碎片笔记路由模块

提供碎片笔记的 CRUD API 端点
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from core import success_response, paginated_data
from core.auth import get_current_user
from models.database import get_db
from services import fragment_service


# ========== Pydantic 请求/响应模型 ==========

class FragmentCreate(BaseModel):
    """创建碎片笔记请求模型"""
    transcript: Optional[str] = Field(None, description="转写文本")
    source: str = Field("voice", description="来源：voice, manual, video_parse")
    audio_path: Optional[str] = Field(None, description="音频文件路径")

    class Config:
        json_schema_extra = {
            "example": {
                "transcript": "今天想到了一个关于定位的好点子",
                "source": "voice"
            }
        }


class FragmentItem(BaseModel):
    """碎片笔记响应模型"""
    id: str
    transcript: Optional[str]
    summary: Optional[str]
    tags: Optional[str]
    source: str
    sync_status: str
    created_at: str


class FragmentDetail(FragmentItem):
    """碎片笔记详情响应模型"""
    audio_path: Optional[str]


class FragmentListResponse(BaseModel):
    """碎片列表响应模型"""
    items: List[FragmentItem]
    total: int
    limit: int
    offset: int

router = APIRouter(
    prefix="/api/fragments",
    tags=["fragments"],
    responses={401: {"description": "未认证"}},
)


@router.get("/")
async def list_fragments(
    limit: int = Query(20, ge=1, le=100, description="返回数量限制"),
    offset: int = Query(0, ge=0, description="偏移量"),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    获取当前用户的碎片笔记列表

    返回按创建时间降序排列的碎片列表
    """
    fragments = fragment_service.list_fragments(
        db=db,
        user_id=current_user["user_id"],
        limit=limit,
        offset=offset,
    )
    total = fragment_service.count_fragments(db=db, user_id=current_user["user_id"])

    return success_response(
        data=paginated_data(
            items=fragments,
            total=total,
            limit=limit,
            offset=offset,
            serializer=fragment_service.serialize_fragment,
        )
    )


@router.get("/{fragment_id}")
async def get_fragment(
    fragment_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    获取单条碎片笔记详情
    """
    fragment = fragment_service.get_fragment_or_raise(
        db=db,
        user_id=current_user["user_id"],
        fragment_id=fragment_id,
    )

    return success_response(
        data=fragment_service.serialize_fragment(fragment, include_audio_path=True)
    )


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_fragment(
    data: FragmentCreate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    创建新的碎片笔记

    接收 JSON 请求体创建碎片笔记
    """
    fragment = fragment_service.create_fragment(
        db=db,
        user_id=current_user["user_id"],
        transcript=data.transcript,
        source=data.source,
        audio_path=data.audio_path,
    )

    return success_response(
        data=fragment_service.serialize_fragment(fragment),
        message="碎片笔记创建成功",
    )


@router.delete("/{fragment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_fragment(
    fragment_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    删除碎片笔记

    删除成功返回 204 No Content
    """
    fragment_service.delete_fragment(
        db=db,
        user_id=current_user["user_id"],
        fragment_id=fragment_id,
    )

    return None
