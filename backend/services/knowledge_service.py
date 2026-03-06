"""Knowledge domain service.

封装知识库文档相关业务逻辑：
- 查询与序列化
- 创建与删除
- 文件解析
- 权限校验
"""

from __future__ import annotations

from typing import Any, Optional
import tempfile
import os

from sqlalchemy import func
from sqlalchemy.orm import Session

from core.exceptions import NotFoundError, ValidationError
from models import KnowledgeDoc

VALID_DOC_TYPES = {"high_likes", "language_habit"}


def serialize_knowledge_doc(doc: KnowledgeDoc) -> dict[str, Any]:
    """
    将 KnowledgeDoc ORM 对象转换为 API 安全的字典

    Args:
        doc: KnowledgeDoc 数据库模型实例

    Returns:
        序列化后的字典
    """
    return {
        "id": doc.id,
        "title": doc.title,
        "content": doc.content,
        "doc_type": doc.doc_type,
        "vector_ref_id": doc.vector_ref_id,
        "created_at": doc.created_at.isoformat() if doc.created_at else None,
    }


def list_knowledge_docs(
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


def count_knowledge_docs(db: Session, user_id: str, doc_type: Optional[str] = None) -> int:
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


def get_knowledge_doc_or_raise(db: Session, user_id: str, doc_id: str) -> KnowledgeDoc:
    """
    获取单个知识库文档，不存在时抛出异常

    Args:
        db: 数据库会话
        user_id: 用户 ID
        doc_id: 文档 ID

    Returns:
        KnowledgeDoc 实例

    Raises:
        NotFoundError: 文档不存在或无权访问
    """
    doc = (
        db.query(KnowledgeDoc)
        .filter(KnowledgeDoc.id == doc_id, KnowledgeDoc.user_id == user_id)
        .first()
    )

    if not doc:
        raise NotFoundError(
            message="知识库文档不存在或无权访问",
            resource_type="knowledge_doc",
            resource_id=doc_id,
        )

    return doc


def create_knowledge_doc(
    db: Session,
    user_id: str,
    title: str,
    content: str,
    doc_type: str,
) -> KnowledgeDoc:
    """
    创建知识库文档

    Args:
        db: 数据库会话
        user_id: 用户 ID
        title: 文档标题
        content: 文档内容
        doc_type: 文档类型

    Returns:
        创建的 KnowledgeDoc 实例

    Raises:
        ValidationError: 文档类型无效
    """
    # 验证文档类型
    if doc_type not in VALID_DOC_TYPES:
        raise ValidationError(
            message="文档类型无效",
            field_errors={"doc_type": f"必须是以下之一: {', '.join(VALID_DOC_TYPES)}"}
        )

    # 创建文档记录
    doc = KnowledgeDoc(
        user_id=user_id,
        title=title,
        content=content,
        doc_type=doc_type,
    )

    db.add(doc)
    db.commit()
    db.refresh(doc)

    return doc


def delete_knowledge_doc(db: Session, doc: KnowledgeDoc) -> None:
    """
    删除知识库文档

    Args:
        db: 数据库会话
        doc: 要删除的文档实例
    """
    db.delete(doc)
    db.commit()


def parse_uploaded_file(file_content: bytes, filename: str) -> str:
    """
    解析上传的文件内容

    Args:
        file_content: 文件二进制内容
        filename: 文件名（用于检测格式）

    Returns:
        提取的文本内容

    Raises:
        ValidationError: 文件格式不支持、编码错误、内容为空等
    """
    filename_lower = filename.lower()

    # 验证文件格式
    if not (filename_lower.endswith(".txt") or filename_lower.endswith(".docx")):
        raise ValidationError(
            message="文件格式不支持",
            field_errors={"file": "仅支持 .txt 和 .docx 格式"}
        )

    content = ""

    try:
        if filename_lower.endswith(".txt"):
            # 直接读取 UTF-8 编码文本
            content = file_content.decode("utf-8")

        elif filename_lower.endswith(".docx"):
            # 使用 python-docx 提取文本
            try:
                from docx import Document

                # 保存到临时文件
                with tempfile.NamedTemporaryFile(delete=False, suffix=".docx") as tmp_file:
                    tmp_file.write(file_content)
                    tmp_path = tmp_file.name

                # 使用 python-docx 读取
                doc = Document(tmp_path)
                content = "\n".join([para.text for para in doc.paragraphs])

                # 清理临时文件
                os.unlink(tmp_path)

            except ImportError:
                raise ValidationError(
                    message="服务器缺少依赖",
                    field_errors={"file": "服务器未安装 python-docx 库，无法处理 .docx 文件"}
                )
            except Exception as e:
                raise ValidationError(
                    message="文件解析失败",
                    field_errors={"file": f"无法解析 .docx 文件: {str(e)}"}
                )

    except UnicodeDecodeError:
        raise ValidationError(
            message="文件编码错误",
            field_errors={"file": "文件必须是 UTF-8 编码"}
        )

    # 验证内容不为空
    if not content.strip():
        raise ValidationError(
            message="文件内容为空",
            field_errors={"file": "上传的文件没有有效内容"}
        )

    return content