from __future__ import annotations

from types import SimpleNamespace
from typing import Any, Optional

from sqlalchemy.orm import Session

from core.exceptions import NotFoundError, ValidationError
from domains.tasks import repository as task_repository
from models import KnowledgeDoc, TaskRun
from modules.shared.content.content_markdown import extract_plain_text
from modules.shared.ports import KnowledgeIndexStore
from utils.serialization import format_iso_datetime

from domains.knowledge import repository as knowledge_repository
from .chunking import build_knowledge_chunks
from .indexing import KnowledgeIndexingService
from modules.shared.content.document_parsers import parse_uploaded_text
from .reference_script_task import (
    TASK_TYPE_REFERENCE_SCRIPT_PROCESSING,
    build_reference_script_processing_task_service,
)
from .schemas import (
    KnowledgeDocItem,
    KnowledgeDocListResponse,
    KnowledgeSearchItem,
    KnowledgeSearchResponse,
    KnowledgeUploadResponse,
)

VALID_DOC_TYPES = {"high_likes", "language_habit", "reference_script"}


def map_knowledge_doc(doc: KnowledgeDoc) -> KnowledgeDocItem:
    """将知识库文档模型映射为对外响应结构。"""
    return KnowledgeDocItem(
        id=doc.id,
        title=doc.title,
        body_markdown=doc.body_markdown,
        doc_type=doc.doc_type,
        vector_ref_id=doc.vector_ref_id,
        processing_status=doc.processing_status,
        style_description=doc.style_description,
        source_type=doc.source_type or "manual",
        source_filename=doc.source_filename,
        source_mime_type=doc.source_mime_type,
        chunk_count=doc.chunk_count or 0,
        processing_error=doc.processing_error,
        created_at=format_iso_datetime(doc.created_at),
        updated_at=format_iso_datetime(doc.updated_at),
    )


def map_knowledge_upload_response(doc: KnowledgeDoc, task_run: TaskRun | None = None) -> KnowledgeUploadResponse:
    """将上传结果映射为“文档详情 + 可选任务句柄”的统一响应。"""
    payload = map_knowledge_doc(doc).model_dump()
    return KnowledgeUploadResponse(
        **payload,
        task_id=task_run.id if task_run else None,
        task_type=task_run.task_type if task_run else None,
        status_query_url=f"/api/tasks/{task_run.id}" if task_run else None,
    )


class KnowledgeUseCase:
    def __init__(self, *, knowledge_index_store: KnowledgeIndexStore, task_runner: Any = None) -> None:
        """装配知识库用例依赖。"""
        self.indexing_service = KnowledgeIndexingService(store=knowledge_index_store)
        self.task_runner = task_runner

    async def create_doc(
        self,
        *,
        db: Session,
        user_id: str,
        title: str,
        body_markdown: str,
        doc_type: str,
        source_type: str = "manual",
        source_filename: str | None = None,
        source_mime_type: str | None = None,
    ) -> KnowledgeDoc:
        """创建知识库文档，并按类型决定同步或异步索引。"""
        _validate_doc_type(doc_type)
        normalized_markdown, plain_text, chunks = _normalize_markdown_payload(body_markdown)

        if doc_type == "reference_script":
            return await self._create_reference_script_doc(
                db=db,
                user_id=user_id,
                title=title,
                plain_text=plain_text,
                normalized_markdown=normalized_markdown,
                chunks=chunks,
                source_type=source_type,
                source_filename=source_filename,
                source_mime_type=source_mime_type,
            )

        doc = knowledge_repository.create(
            db=db,
            user_id=user_id,
            title=title,
            content=plain_text,
            body_markdown=normalized_markdown,
            doc_type=doc_type,
            processing_status="ready",
            source_type=source_type,
            source_filename=source_filename,
            source_mime_type=source_mime_type,
            chunk_count=len(chunks),
        )
        try:
            vector_ref_id = await self.indexing_service.index_document(
                user_id=user_id,
                doc_id=doc.id,
                title=title,
                doc_type=doc_type,
                chunks=chunks,
            )
            updated = knowledge_repository.update(
                db=db,
                doc=doc,
                vector_ref_id=vector_ref_id,
                chunk_count=len(chunks),
                processing_error=None,
            )
            return updated
        except Exception as exc:
            return knowledge_repository.update(
                db=db,
                doc=doc,
                processing_status="failed",
                processing_error=str(exc),
            )

    async def create_doc_from_upload(
        self,
        *,
        db: Session,
        user_id: str,
        title: str,
        file_content: bytes,
        filename: str,
        mime_type: str | None,
        doc_type: str,
    ) -> KnowledgeUploadResponse:
        """解析上传文件并创建知识库文档，必要时附带异步任务句柄。"""
        body_markdown = parse_uploaded_text(file_content=file_content, filename=filename)
        doc = await self.create_doc(
            db=db,
            user_id=user_id,
            title=title,
            body_markdown=body_markdown,
            doc_type=doc_type,
            source_type="upload",
            source_filename=filename,
            source_mime_type=mime_type,
        )
        task_run = self._find_upload_task(db=db, user_id=user_id, doc=doc)
        db.refresh(doc)
        return map_knowledge_upload_response(doc, task_run)

    async def _create_reference_script_doc(
        self,
        *,
        db: Session,
        user_id: str,
        title: str,
        plain_text: str,
        normalized_markdown: str,
        chunks,
        source_type: str,
        source_filename: str | None,
        source_mime_type: str | None,
    ) -> KnowledgeDoc:
        """创建 reference_script 文档并触发异步处理任务。"""
        doc = knowledge_repository.create(
            db=db,
            user_id=user_id,
            title=title,
            content=plain_text,
            body_markdown=normalized_markdown,
            doc_type="reference_script",
            processing_status="pending",
            source_type=source_type,
            source_filename=source_filename,
            source_mime_type=source_mime_type,
            chunk_count=len(chunks),
        )
        return await self._launch_reference_script_task(
            db=db, doc=doc, user_id=user_id, plain_text=plain_text
        )

    async def update_doc(
        self,
        *,
        db: Session,
        user_id: str,
        doc_id: str,
        title: str | None,
        body_markdown: str | None,
    ) -> KnowledgeDoc:
        """更新知识库文档正文并刷新索引。"""
        doc = self.get_doc(db=db, user_id=user_id, doc_id=doc_id)
        normalized_markdown, plain_text, chunks = _normalize_markdown_payload(body_markdown or (doc.body_markdown or ""))
        updated = knowledge_repository.update(
            db=db,
            doc=doc,
            title=title,
            content=plain_text,
            body_markdown=normalized_markdown,
            processing_status="pending" if doc.doc_type == "reference_script" else "ready",
            processing_error=None,
            chunk_count=len(chunks),
        )

        if updated.doc_type == "reference_script":
            return await self._launch_reference_script_task(
                db=db, doc=updated, user_id=user_id, plain_text=plain_text
            )

        try:
            vector_ref_id = await self.indexing_service.refresh_document(
                user_id=user_id,
                doc_id=updated.id,
                title=updated.title,
                doc_type=updated.doc_type,
                chunks=chunks,
            )
            return knowledge_repository.update(
                db=db,
                doc=updated,
                vector_ref_id=vector_ref_id,
                chunk_count=len(chunks),
                processing_status="ready",
                processing_error=None,
            )
        except Exception as exc:
            return knowledge_repository.update(
                db=db,
                doc=updated,
                processing_status="failed",
                processing_error=str(exc),
            )

    async def _launch_reference_script_task(
        self,
        *,
        db: Session,
        doc: KnowledgeDoc,
        user_id: str,
        plain_text: str,
    ) -> KnowledgeDoc:
        """启动 reference_script 处理任务；runner 未配置时回写失败状态。"""
        if self.task_runner is None:
            return knowledge_repository.update(
                db=db,
                doc=doc,
                processing_status="failed",
                processing_error="reference_script task runner 未配置",
            )
        task_service = build_reference_script_processing_task_service(
            SimpleNamespace(
                task_runner=self.task_runner,
                knowledge_index_store=self.indexing_service.store,
            )
        )
        await task_service.create_run(
            doc_id=doc.id,
            user_id=user_id,
            script_text=plain_text,
            title=doc.title,
            doc_type=doc.doc_type,
        )
        return doc

    def list_docs(self, *, db: Session, user_id: str, doc_type: Optional[str], limit: int, offset: int) -> KnowledgeDocListResponse:
        """分页返回用户知识库文档列表，可按 doc_type 过滤。"""
        if doc_type:
            _validate_doc_type(doc_type)
        docs = knowledge_repository.list_by_user(db=db, user_id=user_id, doc_type=doc_type, limit=limit, offset=offset)
        total = knowledge_repository.count_by_user(db=db, user_id=user_id, doc_type=doc_type)
        return KnowledgeDocListResponse(
            items=[map_knowledge_doc(doc) for doc in docs],
            total=total,
            limit=limit,
            offset=offset,
        )

    def get_doc(self, *, db: Session, user_id: str, doc_id: str) -> KnowledgeDoc:
        """读取单条知识库文档。"""
        doc = knowledge_repository.get_by_id(db=db, user_id=user_id, doc_id=doc_id)
        if not doc:
            raise NotFoundError(message="知识库文档不存在或无权访问", resource_type="knowledge_doc", resource_id=doc_id)
        return doc

    async def search_docs(self, *, db: Session, user_id: str, query_text: str, top_k: int) -> KnowledgeSearchResponse:
        """按查询文本返回知识库文档级命中列表。"""
        hits = await self.indexing_service.search(user_id=user_id, query_text=query_text, top_k=top_k)
        doc_ids = [item.doc_id for item in hits]
        docs = {doc.id: doc for doc in knowledge_repository.get_by_ids(db=db, user_id=user_id, doc_ids=doc_ids)}
        items: list[KnowledgeSearchItem] = []
        for hit in hits:
            doc = docs.get(hit.doc_id)
            if not doc:
                continue
            payload = map_knowledge_doc(doc)
            items.append(
                KnowledgeSearchItem(
                    **payload.model_dump(),
                    score=float(hit.score),
                    matched_chunks=hit.matched_chunks,
                )
            )
        return KnowledgeSearchResponse(items=items, total=len(items), query_text=query_text)

    async def delete_doc(self, *, db: Session, user_id: str, doc_id: str) -> None:
        """删除知识库文档，并同步删除其全部索引。"""
        doc = self.get_doc(db=db, user_id=user_id, doc_id=doc_id)
        knowledge_repository.delete(db=db, doc=doc)
        await self.indexing_service.delete_document(user_id=user_id, doc_id=doc_id)

    def _find_upload_task(self, *, db: Session, user_id: str, doc: KnowledgeDoc) -> TaskRun | None:
        """为异步上传文档回查刚创建的任务句柄。"""
        if doc.doc_type != "reference_script":
            return None
        return task_repository.get_latest_run_by_resource(
            db=db,
            user_id=user_id,
            task_type=TASK_TYPE_REFERENCE_SCRIPT_PROCESSING,
            resource_type="knowledge_doc",
            resource_id=doc.id,
        )


def _validate_doc_type(doc_type: str) -> None:
    """校验知识库文档类型。"""
    if doc_type not in VALID_DOC_TYPES:
        raise ValidationError(message="文档类型无效", field_errors={"doc_type": f"必须是以下之一: {', '.join(sorted(VALID_DOC_TYPES))}"})


def _normalize_markdown_payload(body_markdown: str) -> tuple[str, str, list]:
    """规范化 Markdown、纯文本与分块结果，作为知识库索引输入。"""
    normalized_markdown = body_markdown.strip()
    if not normalized_markdown:
        raise ValidationError(message="知识库内容不能为空", field_errors={"body_markdown": "请输入文档内容"})
    plain_text = extract_plain_text(normalized_markdown) or normalized_markdown
    chunks = build_knowledge_chunks(plain_text)
    if not chunks:
        raise ValidationError(message="知识库内容不能为空", field_errors={"body_markdown": "请输入文档内容"})
    return normalized_markdown, plain_text, chunks
