from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from sqlalchemy.orm import Session

from core import ResponseModel, success_response
from core.auth import get_current_user
from modules.shared.container import ServiceContainer, get_container, get_db_session

from .application import KnowledgeUseCase, map_knowledge_doc, parse_uploaded_file
from .schemas import (
    KnowledgeDocCreateRequest,
    KnowledgeDocItem,
    KnowledgeDocListResponse,
    KnowledgeSearchRequest,
    KnowledgeSearchResponse,
    KnowledgeDocUpdateRequest,
)

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"], responses={401: {"description": "未认证"}})

def get_knowledge_use_case(container: ServiceContainer = Depends(get_container)) -> KnowledgeUseCase:
    return KnowledgeUseCase(vector_store=container.vector_store)


@router.post(
    "",
    response_model=ResponseModel[KnowledgeDocItem],
    summary="创建知识库文档",
    description="通过标题、Markdown 正文和文档类型直接创建一条知识库文档。",
)
async def create_knowledge_doc(
    data: KnowledgeDocCreateRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
    use_case: KnowledgeUseCase = Depends(get_knowledge_use_case),
):
    doc = await use_case.create_doc(
        db=db,
        user_id=current_user["user_id"],
        title=data.title,
        body_markdown=data.body_markdown,
        doc_type=data.doc_type,
    )
    return success_response(data=map_knowledge_doc(doc), message="知识库文档创建成功")


@router.post(
    "/upload",
    response_model=ResponseModel[KnowledgeDocItem],
    summary="上传知识库文档",
    description="上传 TXT 或 DOCX 文件并解析为知识库文档后入库。",
)
async def upload_knowledge_doc(
    file: UploadFile = File(..., description="TXT 或 Word 文档"),
    title: str = Form(...),
    doc_type: str = Form(...),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
    use_case: KnowledgeUseCase = Depends(get_knowledge_use_case),
):
    content = parse_uploaded_file(file_content=await file.read(), filename=file.filename or "")
    doc = await use_case.create_doc(
        db=db,
        user_id=current_user["user_id"],
        title=title,
        body_markdown=content,
        doc_type=doc_type,
    )
    return success_response(data=map_knowledge_doc(doc), message="知识库文档上传成功")


@router.get(
    "",
    response_model=ResponseModel[KnowledgeDocListResponse],
    summary="获取知识库文档列表",
    description="按分页返回当前用户的知识库文档，可按文档类型过滤。",
)
async def list_knowledge_docs(
    doc_type: str | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
    use_case: KnowledgeUseCase = Depends(get_knowledge_use_case),
):
    return success_response(data=use_case.list_docs(db=db, user_id=current_user["user_id"], doc_type=doc_type, limit=limit, offset=offset))


@router.post(
    "/search",
    response_model=ResponseModel[KnowledgeSearchResponse],
    summary="搜索知识库文档",
    description="基于向量检索返回与查询文本语义最相关的知识库文档。",
)
async def search_knowledge_docs(
    data: KnowledgeSearchRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
    use_case: KnowledgeUseCase = Depends(get_knowledge_use_case),
):
    return success_response(data=await use_case.search_docs(db=db, user_id=current_user["user_id"], query_text=data.query_text, top_k=data.top_k))


@router.get(
    "/{doc_id}",
    response_model=ResponseModel[KnowledgeDocItem],
    summary="获取知识库文档详情",
    description="根据文档 ID 返回单条知识库文档详情。",
)
async def get_knowledge_doc(
    doc_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
    use_case: KnowledgeUseCase = Depends(get_knowledge_use_case),
):
    return success_response(data=map_knowledge_doc(use_case.get_doc(db=db, user_id=current_user["user_id"], doc_id=doc_id)))


@router.patch(
    "/{doc_id}",
    response_model=ResponseModel[KnowledgeDocItem],
    summary="更新知识库文档",
    description="更新知识库文档标题或 Markdown 正文，并同步刷新向量索引。",
)
async def update_knowledge_doc(
    doc_id: str,
    data: KnowledgeDocUpdateRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
    use_case: KnowledgeUseCase = Depends(get_knowledge_use_case),
):
    doc = await use_case.update_doc(
        db=db,
        user_id=current_user["user_id"],
        doc_id=doc_id,
        title=data.title,
        body_markdown=data.body_markdown,
    )
    return success_response(data=map_knowledge_doc(doc), message="知识库文档更新成功")


@router.delete(
    "/{doc_id}",
    response_model=ResponseModel[None],
    summary="删除知识库文档",
    description="删除知识库文档，并同步删除向量库中的对应索引。",
)
async def delete_knowledge_doc(
    doc_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
    use_case: KnowledgeUseCase = Depends(get_knowledge_use_case),
):
    await use_case.delete_doc(db=db, user_id=current_user["user_id"], doc_id=doc_id)
    return success_response(data=None, message="知识库文档删除成功")
