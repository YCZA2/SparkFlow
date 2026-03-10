from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session

from core.auth import get_current_user
from modules.shared.container import ServiceContainer, get_container, get_db_session

from .application import MarkdownExportUseCase
from .schemas import MarkdownBatchExportRequest

router = APIRouter(prefix="/api/exports", tags=["exports"], responses={401: {"description": "未认证"}})


def get_export_use_case(container: ServiceContainer = Depends(get_container)) -> MarkdownExportUseCase:
    """构建 Markdown 导出用例。"""
    return MarkdownExportUseCase(
        file_storage=container.file_storage,
        vector_store=container.vector_store,
        llm_provider=container.llm_provider,
    )


@router.get(
    "/markdown/{content_type}/{content_id}",
    summary="导出单条 Markdown",
    description="按内容类型导出单条 Markdown 文档。",
)
async def export_markdown(
    content_type: str,
    content_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
    use_case: MarkdownExportUseCase = Depends(get_export_use_case),
):
    if content_type == "fragment":
        markdown_file, _ = use_case.export_fragment(db=db, user_id=current_user["user_id"], fragment_id=content_id)
    elif content_type == "script":
        markdown_file, _ = use_case.export_script(db=db, user_id=current_user["user_id"], script_id=content_id)
    elif content_type == "knowledge":
        markdown_file, _ = use_case.export_knowledge_doc(db=db, user_id=current_user["user_id"], doc_id=content_id)
    else:
        return Response(status_code=404)
    return Response(
        content=markdown_file.content,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{markdown_file.filename}"'},
    )


@router.post(
    "/markdown/batch",
    summary="批量导出 Markdown zip",
    description="将多条碎片、脚本和知识库文档打包导出为 zip。",
)
async def export_markdown_batch(
    data: MarkdownBatchExportRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
    use_case: MarkdownExportUseCase = Depends(get_export_use_case),
):
    payload = use_case.export_batch(db=db, user_id=current_user["user_id"], request=data)
    return Response(
        content=payload,
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="sparkflow-markdown-export.zip"'},
    )
