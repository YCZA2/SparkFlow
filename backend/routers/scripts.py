"""口播稿路由模块。"""

from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from core import success_response, paginated_data
from core.auth import get_current_user
from domains.scripts import service as script_service
from models.database import get_db


class ScriptGenerateRequest(BaseModel):
    """口播稿生成请求模型"""

    fragment_ids: List[str] = Field(..., description="选中的碎片 ID 列表", min_length=1, max_length=20)
    mode: str = Field(..., description="生成模式：mode_a (导师爆款) 或 mode_b (专属二脑)")

    class Config:
        json_schema_extra = {
            "example": {
                "fragment_ids": ["fragment-uuid-1", "fragment-uuid-2", "fragment-uuid-3"],
                "mode": "mode_a",
            }
        }


class ScriptItem(BaseModel):
    """口播稿列表项响应模型"""

    id: str
    title: Optional[str]
    mode: str
    status: str
    is_daily_push: bool
    created_at: str


class ScriptDetail(ScriptItem):
    """口播稿详情响应模型"""

    content: Optional[str]
    source_fragment_ids: Optional[List[str]]


router = APIRouter(
    prefix="/api/scripts",
    tags=["scripts"],
    responses={401: {"description": "未认证"}},
)


@router.post("/generate", status_code=status.HTTP_201_CREATED)
async def generate_script(
    data: ScriptGenerateRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    script = await script_service.generate_script(
        db=db,
        user_id=current_user["user_id"],
        fragment_ids=data.fragment_ids,
        mode=data.mode,
    )

    return success_response(
        data=script_service.serialize_script(script),
        message="口播稿生成成功",
    )


@router.get("/")
async def list_scripts(
    limit: int = Query(20, ge=1, le=100, description="返回数量限制"),
    offset: int = Query(0, ge=0, description="偏移量"),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    scripts = script_service.list_scripts(
        db=db,
        user_id=current_user["user_id"],
        limit=limit,
        offset=offset,
    )
    total = script_service.count_scripts(db=db, user_id=current_user["user_id"])

    return success_response(
        data=paginated_data(
            items=scripts,
            total=total,
            limit=limit,
            offset=offset,
            serializer=script_service.serialize_script,
        )
    )


@router.get("/{script_id}")
async def get_script(
    script_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    script = script_service.get_script_or_raise(
        db=db,
        user_id=current_user["user_id"],
        script_id=script_id,
    )

    return success_response(data=script_service.serialize_script(script))


class ScriptUpdateRequest(BaseModel):
    """口播稿更新请求模型"""

    status: Optional[str] = Field(None, description="更新状态: draft, ready, filmed")
    title: Optional[str] = Field(None, description="更新标题")

    class Config:
        json_schema_extra = {"example": {"status": "filmed", "title": "我的定位方法论"}}


@router.patch("/{script_id}")
async def update_script(
    script_id: str,
    data: ScriptUpdateRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """更新口播稿状态或标题"""
    script = script_service.update_script(
        db=db,
        user_id=current_user["user_id"],
        script_id=script_id,
        status_value=data.status,
        title=data.title,
    )

    return success_response(
        data=script_service.serialize_script(script),
        message="口播稿更新成功",
    )


@router.delete("/{script_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_script(
    script_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    script_service.delete_script(
        db=db,
        user_id=current_user["user_id"],
        script_id=script_id,
    )
    return None
