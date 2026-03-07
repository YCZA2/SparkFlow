"""碎片笔记路由模块。"""

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from core import success_response, paginated_data
from core.auth import get_current_user
from domains.fragments import service as fragment_service
from models.database import get_db
from schemas.fragment import FragmentCreate, FragmentSimilarityQuery

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


@router.post("/similar")
async def query_similar_fragments(
    data: FragmentSimilarityQuery,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """基于语义相似度检索当前用户的历史碎片。"""
    items = await fragment_service.query_similar_fragments(
        db=db,
        user_id=current_user["user_id"],
        query_text=data.query_text,
        top_k=data.top_k,
        exclude_ids=data.exclude_ids,
    )
    return success_response(
        data={
            "items": items,
            "total": len(items),
            "query_text": data.query_text,
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
