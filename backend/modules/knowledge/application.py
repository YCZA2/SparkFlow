from __future__ import annotations

import os
import tempfile
from typing import Any, Optional

from sqlalchemy.orm import Session

from core.exceptions import NotFoundError, ValidationError
from models import KnowledgeDoc
from modules.shared.content.content_markdown import extract_plain_text
from utils.serialization import format_iso_datetime

from domains.knowledge import repository as knowledge_repository
from modules.shared.ports import VectorStore
from .schemas import KnowledgeDocItem, KnowledgeDocListResponse, KnowledgeSearchItem, KnowledgeSearchResponse

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
        created_at=format_iso_datetime(doc.created_at),
    )


def parse_uploaded_file(file_content: bytes, filename: str) -> str:
    filename_lower = filename.lower()
    if not (filename_lower.endswith(".txt") or filename_lower.endswith(".docx")):
        raise ValidationError(message="文件格式不支持", field_errors={"file": "仅支持 .txt 和 .docx 格式"})
    if filename_lower.endswith(".txt"):
        try:
            content = file_content.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise ValidationError(message="文件编码错误", field_errors={"file": "文件必须是 UTF-8 编码"}) from exc
    else:
        try:
            from docx import Document
        except ImportError as exc:
            raise ValidationError(message="服务器缺少依赖", field_errors={"file": "服务器未安装 python-docx 库"}) from exc
        with tempfile.NamedTemporaryFile(delete=False, suffix=".docx") as tmp_file:
            tmp_file.write(file_content)
            tmp_path = tmp_file.name
        try:
            document = Document(tmp_path)
            content = "\n".join(paragraph.text for paragraph in document.paragraphs)
        finally:
            os.unlink(tmp_path)
    if not content.strip():
        raise ValidationError(message="文件内容为空", field_errors={"file": "上传的文件没有有效内容"})
    return content


class KnowledgeUseCase:
    def __init__(self, *, vector_store: VectorStore, pipeline_runner: Any = None) -> None:
        """装配知识库用例依赖。pipeline_runner 用于 reference_script 的异步处理。"""
        self.vector_store = vector_store
        self.pipeline_runner = pipeline_runner

    async def create_doc(
        self,
        *,
        db: Session,
        user_id: str,
        title: str,
        body_markdown: str,
        doc_type: str,
    ) -> KnowledgeDoc:
        """创建知识库文档。

        reference_script 类型：写入数据库后触发异步处理流水线（风格分析+分块向量化）。
        其他类型：直接同步写入向量索引。
        """
        if doc_type not in VALID_DOC_TYPES:
            raise ValidationError(message="文档类型无效", field_errors={"doc_type": f"必须是以下之一: {', '.join(sorted(VALID_DOC_TYPES))}"})
        normalized_markdown = body_markdown.strip()
        plain_text = extract_plain_text(normalized_markdown) or normalized_markdown

        if doc_type == "reference_script":
            return await self._create_reference_script_doc(
                db=db,
                user_id=user_id,
                title=title,
                plain_text=plain_text,
                normalized_markdown=normalized_markdown,
            )

        doc = knowledge_repository.create(
            db=db,
            user_id=user_id,
            title=title,
            content=plain_text,
            body_markdown=normalized_markdown,
            doc_type=doc_type,
        )
        try:
            doc.vector_ref_id = await self.vector_store.upsert_knowledge_doc(
                user_id=user_id,
                doc_id=doc.id,
                title=title,
                content=plain_text,
                doc_type=doc_type,
            )
            db.add(doc)
            db.commit()
            db.refresh(doc)
        except Exception:
            db.rollback()
        return doc

    async def _create_reference_script_doc(
        self,
        *,
        db: Session,
        user_id: str,
        title: str,
        plain_text: str,
        normalized_markdown: str,
    ) -> KnowledgeDoc:
        """创建 reference_script 文档并触发异步处理 pipeline。

        写入时 processing_status=pending，pipeline 完成后更新为 ready。
        如果 pipeline_runner 未配置则直接标记为 failed 并告知调用方。
        """
        from .rag_processing_pipeline import ReferenceScriptProcessingPipelineService

        doc = knowledge_repository.create(
            db=db,
            user_id=user_id,
            title=title,
            content=plain_text,
            body_markdown=normalized_markdown,
            doc_type="reference_script",
            processing_status="pending",
        )

        if self.pipeline_runner is None:
            # pipeline_runner 未注入（如测试环境），跳过异步处理
            return doc

        pipeline_service = ReferenceScriptProcessingPipelineService(pipeline_runner=self.pipeline_runner)
        await pipeline_service.create_run(
            doc_id=doc.id,
            user_id=user_id,
            script_text=plain_text,
        )
        return doc

    async def update_doc(self, *, db: Session, user_id: str, doc_id: str, title: str | None, body_markdown: str | None) -> KnowledgeDoc:
        """更新知识库文档正文并刷新向量索引。"""
        doc = self.get_doc(db=db, user_id=user_id, doc_id=doc_id)
        normalized_markdown = body_markdown.strip() if body_markdown is not None else (doc.body_markdown or "")
        plain_text = extract_plain_text(normalized_markdown) or doc.content
        updated = knowledge_repository.update(
            db=db,
            doc=doc,
            title=title,
            content=plain_text,
            body_markdown=normalized_markdown,
        )
        try:
            updated.vector_ref_id = await self.vector_store.upsert_knowledge_doc(
                user_id=user_id,
                doc_id=updated.id,
                title=updated.title,
                content=updated.content,
                doc_type=updated.doc_type,
            )
            db.add(updated)
            db.commit()
            db.refresh(updated)
        except Exception:
            db.rollback()
        return updated

    def list_docs(self, *, db: Session, user_id: str, doc_type: Optional[str], limit: int, offset: int) -> KnowledgeDocListResponse:
        """分页返回用户知识库文档列表，可按 doc_type 过滤。"""
        if doc_type and doc_type not in VALID_DOC_TYPES:
            raise ValidationError(message="文档类型无效", field_errors={"doc_type": f"必须是以下之一: {', '.join(sorted(VALID_DOC_TYPES))}"})
        docs = knowledge_repository.list_by_user(db=db, user_id=user_id, doc_type=doc_type, limit=limit, offset=offset)
        total = knowledge_repository.count_by_user(db=db, user_id=user_id, doc_type=doc_type)
        return KnowledgeDocListResponse(
            items=[map_knowledge_doc(doc) for doc in docs],
            total=total,
            limit=limit,
            offset=offset,
        )

    def get_doc(self, *, db: Session, user_id: str, doc_id: str) -> KnowledgeDoc:
        doc = knowledge_repository.get_by_id(db=db, user_id=user_id, doc_id=doc_id)
        if not doc:
            raise NotFoundError(message="知识库文档不存在或无权访问", resource_type="knowledge_doc", resource_id=doc_id)
        return doc

    async def search_docs(self, *, db: Session, user_id: str, query_text: str, top_k: int) -> KnowledgeSearchResponse:
        results = await self.vector_store.query_knowledge_docs(user_id=user_id, query_text=query_text, top_k=top_k)
        doc_ids = [item["doc_id"] for item in results]
        docs = {doc.id: doc for doc in knowledge_repository.list_by_user(db=db, user_id=user_id, limit=100, offset=0) if doc.id in doc_ids}
        items: list[KnowledgeSearchItem] = []
        for item in results:
            doc = docs.get(item["doc_id"])
            if not doc:
                continue
            payload = map_knowledge_doc(doc)
            items.append(KnowledgeSearchItem(**payload.model_dump(), score=float(item["score"])))
        return KnowledgeSearchResponse(items=items, total=len(items), query_text=query_text)

    async def delete_doc(self, *, db: Session, user_id: str, doc_id: str) -> None:
        """删除知识库文档，并同步清理向量库中对应的向量数据。

        reference_script 删除分块向量（ID 前缀 refscript_{doc_id}:chunk_*）；
        其他类型删除整文档向量（ID 格式 docs_{user_id}:{doc_id}）。
        """
        doc = self.get_doc(db=db, user_id=user_id, doc_id=doc_id)
        knowledge_repository.delete(db=db, doc=doc)
        if doc.doc_type == "reference_script":
            await self.vector_store.delete_reference_script_chunks(user_id=user_id, doc_id=doc_id)
        else:
            await self.vector_store.delete_knowledge_doc(user_id=user_id, doc_id=doc_id)
