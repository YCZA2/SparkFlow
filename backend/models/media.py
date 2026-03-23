"""
知识库、媒体资产与内容关联模型
"""

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from models.database import Base
from models.utils import generate_uuid, utc_now


class KnowledgeDoc(Base):
    """
    知识库文档表

    存储用户上传的高赞文案、语言习惯文档或参考脚本，用于风格模仿和 RAG 生成
    doc_type 取值：'high_likes' | 'language_habit' | 'reference_script'
    reference_script 类型通过异步 pipeline 提取风格描述并分块向量化
    """
    __tablename__ = "knowledge_docs"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=False)
    content = Column(Text, nullable=False)  # 由 Markdown 派生的纯文本索引载荷
    body_markdown = Column(Text, nullable=False)  # Markdown 正文
    doc_type = Column(String, nullable=False)  # 'high_likes'|'language_habit'|'reference_script'
    vector_ref_id = Column(String, nullable=True)  # 向量库中的引用ID，格式：docs_{user_id}:{doc_id}
    style_description = Column(Text, nullable=True)  # LLM 提取的风格描述，仅 reference_script 使用
    processing_status = Column(String, nullable=False, default="ready")  # 处理状态：pending|processing|ready|failed
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    # 关联关系
    user = relationship("User", back_populates="knowledge_docs")

    def __repr__(self) -> str:
        return f"<KnowledgeDoc(id={self.id}, user_id={self.user_id}, title={self.title})>"


class MediaAsset(Base):
    """统一媒体资源表，记录对象存储元数据和文件信息。"""

    __tablename__ = "media_assets"
    __table_args__ = (
        Index("ix_media_assets_user_id_created_at", "user_id", "created_at"),
        Index("ix_media_assets_user_id_media_kind", "user_id", "media_kind"),
    )

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    media_kind = Column(String, nullable=False)  # image | audio | file
    original_filename = Column(String, nullable=False)
    mime_type = Column(String, nullable=False)
    storage_provider = Column(String, nullable=False, default="local")
    bucket = Column(String, nullable=False, default="local")
    object_key = Column(String, nullable=False)
    access_level = Column(String, nullable=False, default="private")
    file_size = Column(Integer, nullable=False)
    checksum = Column(String, nullable=True)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    status = Column(String, nullable=False, default="ready")
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    user = relationship("User", back_populates="media_assets")

    def __repr__(self) -> str:
        return f"<MediaAsset(id={self.id}, user_id={self.user_id}, media_kind={self.media_kind})>"


class ContentMediaLink(Base):
    """统一内容资源关联表，用于 fragment/script/knowledge 复用素材。"""

    __tablename__ = "content_media_links"
    __table_args__ = (
        UniqueConstraint("media_asset_id", "content_type", "content_id", "role", name="uq_content_media_links_asset_content_role"),
        Index("ix_content_media_links_content_type_content_id", "content_type", "content_id"),
    )

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    media_asset_id = Column(String, ForeignKey("media_assets.id"), nullable=False)
    content_type = Column(String, nullable=False)  # fragment | script | knowledge
    content_id = Column(String, nullable=False)
    role = Column(String, nullable=False, default="attachment")
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    user = relationship("User")
    media_asset = relationship("MediaAsset")

    def __repr__(self) -> str:
        return f"<ContentMediaLink(id={self.id}, content_type={self.content_type}, content_id={self.content_id})>"
