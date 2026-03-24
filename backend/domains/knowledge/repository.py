"""Data access helpers for knowledge docs."""

from __future__ import annotations

from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from models import KnowledgeDoc


def list_by_user(
    db: Session,
    user_id: str,
    doc_type: Optional[str] = None,
    limit: int = 20,
    offset: int = 0,
) -> list[KnowledgeDoc]:
    """
    查询用户的知识库文档列表

    Args:
        db: 数据库会话
        user_id: 用户 ID
        doc_type: 文档类型过滤（可选）
        limit: 返回数量限制
        offset: 偏移量

    Returns:
        知识库文档列表，按创建时间降序排列
    """
    query = db.query(KnowledgeDoc).filter(KnowledgeDoc.user_id == user_id)

    if doc_type:
        query = query.filter(KnowledgeDoc.doc_type == doc_type)

    return (
        query
        .order_by(KnowledgeDoc.created_at.desc())
        .limit(limit)
        .offset(offset)
        .all()
    )


def count_by_user(db: Session, user_id: str, doc_type: Optional[str] = None) -> int:
    """
    统计用户的知识库文档数量

    Args:
        db: 数据库会话
        user_id: 用户 ID
        doc_type: 文档类型过滤（可选）

    Returns:
        文档数量
    """
    query = db.query(func.count(KnowledgeDoc.id)).filter(
        KnowledgeDoc.user_id == user_id
    )

    if doc_type:
        query = query.filter(KnowledgeDoc.doc_type == doc_type)

    return query.scalar() or 0


def get_by_id(db: Session, user_id: str, doc_id: str) -> Optional[KnowledgeDoc]:
    """
    根据 ID 获取知识库文档

    Args:
        db: 数据库会话
        user_id: 用户 ID
        doc_id: 文档 ID

    Returns:
        KnowledgeDoc 实例，不存在时返回 None
    """
    return (
        db.query(KnowledgeDoc)
        .filter(KnowledgeDoc.id == doc_id, KnowledgeDoc.user_id == user_id)
        .first()
    )


def get_by_ids(db: Session, user_id: str, doc_ids: list[str]) -> list[KnowledgeDoc]:
    """按 ID 列表批量读取知识库文档。"""
    if not doc_ids:
        return []
    return (
        db.query(KnowledgeDoc)
        .filter(KnowledgeDoc.user_id == user_id, KnowledgeDoc.id.in_(doc_ids))
        .all()
    )


def create(
    db: Session,
    user_id: str,
    title: str,
    content: str,
    body_markdown: str,
    doc_type: str,
    processing_status: str = "ready",
    source_type: str = "manual",
    source_filename: str | None = None,
    source_mime_type: str | None = None,
    chunk_count: int = 0,
    processing_error: str | None = None,
) -> KnowledgeDoc:
    """
    创建知识库文档

    Args:
        db: 数据库会话
        user_id: 用户 ID
        title: 文档标题
        content: 文档内容
        doc_type: 文档类型
        processing_status: 初始处理状态，reference_script 类型传入 "pending"

    Returns:
        创建的 KnowledgeDoc 实例
    """
    doc = KnowledgeDoc(
        user_id=user_id,
        title=title,
        content=content,
        body_markdown=body_markdown,
        doc_type=doc_type,
        processing_status=processing_status,
        source_type=source_type,
        source_filename=source_filename,
        source_mime_type=source_mime_type,
        chunk_count=chunk_count,
        processing_error=processing_error,
    )

    db.add(doc)
    db.commit()
    db.refresh(doc)

    return doc


def update(
    db: Session,
    *,
    doc: KnowledgeDoc,
    title: str | None = None,
    content: str | None = None,
    body_markdown: str | None = None,
    vector_ref_id: str | None = None,
    chunk_count: int | None = None,
    processing_status: str | None = None,
    processing_error: str | None = None,
) -> KnowledgeDoc:
    """更新知识库文档基础字段。"""
    if title is not None:
        doc.title = title
    if content is not None:
        doc.content = content
    if body_markdown is not None:
        doc.body_markdown = body_markdown
        if content is None:
            doc.content = body_markdown
    if vector_ref_id is not None:
        doc.vector_ref_id = vector_ref_id
    if chunk_count is not None:
        doc.chunk_count = chunk_count
    if processing_status is not None:
        doc.processing_status = processing_status
    if processing_error is not None:
        doc.processing_error = processing_error
    db.commit()
    db.refresh(doc)
    return doc


def update_style_and_index_state(
    db: Session,
    *,
    doc_id: str,
    user_id: str,
    style_description: str,
    processing_status: str,
    processing_error: str | None = None,
    vector_ref_id: str | None = None,
    chunk_count: int | None = None,
) -> Optional[KnowledgeDoc]:
    """原子更新 reference_script 的风格描述与索引元数据，避免双提交不一致。"""
    doc = get_by_id(db=db, user_id=user_id, doc_id=doc_id)
    if not doc:
        return None
    doc.style_description = style_description
    doc.processing_status = processing_status
    doc.processing_error = processing_error
    if vector_ref_id is not None:
        doc.vector_ref_id = vector_ref_id
    if chunk_count is not None:
        doc.chunk_count = chunk_count
    db.commit()
    db.refresh(doc)
    return doc



def delete(db: Session, doc: KnowledgeDoc) -> None:
    """
    删除知识库文档

    Args:
        db: 数据库会话
        doc: 要删除的文档实例
    """
    db.delete(doc)
    db.commit()
