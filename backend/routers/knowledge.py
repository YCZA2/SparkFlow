"""
知识库管理路由模块

提供知识库文档的上传、列表等 API 端点
"""

from typing import Optional

from fastapi import APIRouter, Depends, Query, UploadFile, File, Form
from sqlalchemy.orm import Session

from core import success_response
from core.auth import get_current_user
from domains.knowledge import service as knowledge_service
from models.database import get_db
from schemas.knowledge import KnowledgeDocCreate


# ========== 路由定义 ==========

router = APIRouter(
    prefix="/api/knowledge",
    tags=["knowledge"],
    responses={401: {"description": "未认证"}},
)


@router.post("/")
async def create_knowledge_doc(
    request: KnowledgeDocCreate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    创建知识库文档（JSON 方式）

    允许用户通过 JSON body 上传知识库文档，支持两种类型：
    - high_likes: 高赞文案
    - language_habit: 语言习惯记录
    """
    doc = knowledge_service.create_knowledge_doc(
        db=db,
        user_id=current_user["user_id"],
        title=request.title,
        content=request.content,
        doc_type=request.doc_type,
    )

    return success_response(
        data=knowledge_service.serialize_knowledge_doc(doc),
        message="知识库文档创建成功"
    )


@router.post("/upload")
async def upload_knowledge_doc(
    file: UploadFile = File(..., description="TXT 或 Word 文档"),
    title: str = Form(..., description="文档标题"),
    doc_type: str = Form(..., description="文档类型：high_likes 或 language_habit"),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    上传知识库文档（文件上传方式）

    支持 .txt 和 .docx 文件格式，自动提取文本内容
    """
    # 读取文件内容
    file_content = await file.read()

    # 解析文件内容
    content = knowledge_service.parse_uploaded_file(
        file_content=file_content,
        filename=file.filename,
    )

    # 创建知识库文档
    doc = knowledge_service.create_knowledge_doc(
        db=db,
        user_id=current_user["user_id"],
        title=title,
        content=content,
        doc_type=doc_type,
    )

    return success_response(
        data=knowledge_service.serialize_knowledge_doc(doc),
        message="知识库文档上传成功"
    )


@router.get("/")
async def list_knowledge_docs(
    doc_type: Optional[str] = Query(None, description="按文档类型过滤：high_likes 或 language_habit"),
    limit: int = Query(20, ge=1, le=100, description="返回数量限制"),
    offset: int = Query(0, ge=0, description="偏移量"),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    获取当前用户的知识库文档列表

    支持按文档类型过滤，按创建时间降序排列
    """
    # 验证 doc_type 参数
    if doc_type and doc_type not in knowledge_service.VALID_DOC_TYPES:
        from core.exceptions import ValidationError
        raise ValidationError(
            message="文档类型无效",
            field_errors={"doc_type": f"必须是以下之一: {', '.join(knowledge_service.VALID_DOC_TYPES)}"}
        )

    # 查询文档列表
    docs = knowledge_service.list_knowledge_docs(
        db=db,
        user_id=current_user["user_id"],
        doc_type=doc_type,
        limit=limit,
        offset=offset,
    )

    # 统计总数
    total = knowledge_service.count_knowledge_docs(
        db=db,
        user_id=current_user["user_id"],
        doc_type=doc_type,
    )

    return success_response(
        data={
            "items": [knowledge_service.serialize_knowledge_doc(doc) for doc in docs],
            "total": total,
            "limit": limit,
            "offset": offset,
        }
    )


@router.get("/{doc_id}")
async def get_knowledge_doc(
    doc_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    获取单个知识库文档详情
    """
    doc = knowledge_service.get_knowledge_doc_or_raise(
        db=db,
        user_id=current_user["user_id"],
        doc_id=doc_id,
    )

    return success_response(data=knowledge_service.serialize_knowledge_doc(doc))


@router.delete("/{doc_id}")
async def delete_knowledge_doc(
    doc_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    删除知识库文档
    """
    doc = knowledge_service.get_knowledge_doc_or_raise(
        db=db,
        user_id=current_user["user_id"],
        doc_id=doc_id,
    )

    knowledge_service.delete_knowledge_doc(db=db, doc=doc)

    return success_response(
        data=None,
        message="知识库文档删除成功"
    )
