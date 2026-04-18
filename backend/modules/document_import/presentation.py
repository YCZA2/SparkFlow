"""文档导入 API 路由。"""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from sqlalchemy.orm import Session

from core import ResponseModel, success_response
from core.auth import get_current_user
from modules.shared.infrastructure.container import (
    ServiceContainer,
    get_container,
    get_db_session,
)

from .application import DocumentImportUseCase, build_document_import_use_case
from .schemas import DocumentImportResponse

router = APIRouter(
    prefix="/api/imports", tags=["imports"], responses={401: {"description": "未认证"}}
)


def get_document_import_use_case(
    container: ServiceContainer = Depends(get_container),
) -> DocumentImportUseCase:
    return build_document_import_use_case(container)


@router.post(
    "/document",
    status_code=status.HTTP_200_OK,
    response_model=ResponseModel[DocumentImportResponse],
    summary="导入文档为碎片",
    description="上传文档文件后创建后台解析流水线；调用前必须先在本地创建占位 fragment，并传入 local_fragment_id。",
)
async def import_document(
    file: UploadFile = File(..., description="文档文件（.txt/.md/.docx/.pdf/.xlsx）"),
    folder_id: str | None = Form(None),
    local_fragment_id: str = Form(..., description="本地占位 fragment ID"),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
    use_case: DocumentImportUseCase = Depends(get_document_import_use_case),
):
    result = await use_case.import_document(
        db=db,
        user_id=current_user["user_id"],
        file=file,
        folder_id=folder_id,
        local_fragment_id=local_fragment_id,
    )
    return success_response(data=result, message="文档导入成功，已创建后台任务")
