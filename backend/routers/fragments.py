"""
碎片笔记路由模块

提供碎片笔记的 CRUD API 端点
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from core import success_response
from core.auth import get_current_user
from core.exceptions import NotFoundError, ValidationError
from models import Fragment
from models.database import get_db


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
    fragments = (
        db.query(Fragment)
        .filter(Fragment.user_id == current_user["user_id"])
        .order_by(Fragment.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return success_response(
        data={
            "items": [
                {
                    "id": f.id,
                    "transcript": f.transcript,
                    "summary": f.summary,
                    "tags": f.tags,
                    "source": f.source,
                    "sync_status": f.sync_status,
                    "created_at": f.created_at.isoformat() if f.created_at else None,
                }
                for f in fragments
            ],
            "total": len(fragments),
            "limit": limit,
            "offset": offset,
        }
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
    fragment = (
        db.query(Fragment)
        .filter(
            Fragment.id == fragment_id,
            Fragment.user_id == current_user["user_id"],
        )
        .first()
    )

    if not fragment:
        raise NotFoundError(
            message="碎片笔记不存在或无权访问",
            resource_type="fragment",
            resource_id=fragment_id,
        )

    return success_response(
        data={
            "id": fragment.id,
            "transcript": fragment.transcript,
            "summary": fragment.summary,
            "tags": fragment.tags,
            "source": fragment.source,
            "audio_path": fragment.audio_path,
            "sync_status": fragment.sync_status,
            "created_at": fragment.created_at.isoformat() if fragment.created_at else None,
        }
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
    # 校验 source 参数
    valid_sources = ["voice", "manual", "video_parse"]
    if data.source not in valid_sources:
        raise ValidationError(
            message=f"无效的 source 值，必须是以下之一: {', '.join(valid_sources)}",
            field_errors={"source": f"必须是以下之一: {', '.join(valid_sources)}"},
        )

    fragment = Fragment(
        user_id=current_user["user_id"],
        transcript=data.transcript,
        audio_path=data.audio_path,
        source=data.source,
        sync_status="synced" if data.transcript else "pending",
    )

    db.add(fragment)
    db.commit()
    db.refresh(fragment)

    return success_response(
        data={
            "id": fragment.id,
            "transcript": fragment.transcript,
            "summary": fragment.summary,
            "tags": fragment.tags,
            "source": fragment.source,
            "sync_status": fragment.sync_status,
            "created_at": fragment.created_at.isoformat() if fragment.created_at else None,
        },
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
    fragment = (
        db.query(Fragment)
        .filter(
            Fragment.id == fragment_id,
            Fragment.user_id == current_user["user_id"],
        )
        .first()
    )

    if not fragment:
        raise NotFoundError(
            message="碎片笔记不存在或无权访问",
            resource_type="fragment",
            resource_id=fragment_id,
        )

    db.delete(fragment)
    db.commit()

    return None
