"""
SQLAlchemy 数据模型定义

定义所有数据库表结构，对应 architecture.md 中的 Schema 设计
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from models.database import Base


def generate_uuid() -> str:
    """生成 UUID 字符串"""
    return str(uuid.uuid4())


def utc_now() -> datetime:
    """使用 timezone-aware UTC 时间，避免 utcnow 弃用告警。"""
    return datetime.now(timezone.utc)


class User(Base):
    """
    用户表

    存储用户基本信息，支持 RBAC 角色权限控制（预留 creator 角色）
    """
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=generate_uuid)
    role = Column(String, default="user", nullable=False)  # 'user' | 'creator'
    nickname = Column(String, nullable=True)
    storage_quota = Column(Integer, default=1073741824)  # 预留：存储配额(字节)，默认1GB
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    # 关联关系
    fragments = relationship("Fragment", back_populates="user", cascade="all, delete-orphan")
    fragment_folders = relationship("FragmentFolder", back_populates="user", cascade="all, delete-orphan")
    fragment_tags = relationship("FragmentTag", back_populates="user", cascade="all, delete-orphan")
    scripts = relationship("Script", back_populates="user", cascade="all, delete-orphan")
    knowledge_docs = relationship("KnowledgeDoc", back_populates="user", cascade="all, delete-orphan")
    media_assets = relationship("MediaAsset", back_populates="user", cascade="all, delete-orphan")
    def __repr__(self) -> str:
        return f"<User(id={self.id}, role={self.role}, nickname={self.nickname})>"


class FragmentFolder(Base):
    """用户自定义碎片文件夹。"""

    __tablename__ = "fragment_folders"
    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_fragment_folders_user_name"),
    )

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    name = Column(String(50), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    user = relationship("User", back_populates="fragment_folders")
    fragments = relationship("Fragment", back_populates="folder")

    def __repr__(self) -> str:
        return f"<FragmentFolder(id={self.id}, user_id={self.user_id}, name={self.name})>"


class Fragment(Base):
    """
    碎片笔记表

    存储用户的语音转写碎片，包含 AI 生成的摘要和标签
    """
    __tablename__ = "fragments"
    __table_args__ = (
        Index("ix_fragments_user_id_folder_id", "user_id", "folder_id"),
    )

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    folder_id = Column(String, ForeignKey("fragment_folders.id"), nullable=True)
    audio_storage_provider = Column(String, nullable=True)  # local | oss
    audio_bucket = Column(String, nullable=True)
    audio_object_key = Column(String, nullable=True)
    audio_access_level = Column(String, nullable=True, default="private")
    audio_original_filename = Column(String, nullable=True)
    audio_mime_type = Column(String, nullable=True)
    audio_file_size = Column(Integer, nullable=True)
    audio_checksum = Column(String, nullable=True)
    transcript = Column(Text, nullable=True)  # 转写文本
    speaker_segments = Column(Text, nullable=True)  # JSON数组字符串，说话人分段
    body_html = Column(Text, nullable=False, default="")  # HTML 正文
    plain_text_snapshot = Column(Text, nullable=False, default="")  # 由正文 HTML 派生的纯文本快照
    summary = Column(Text, nullable=True)  # AI一句话摘要
    tags = Column(String, nullable=True)  # JSON数组字符串，AI自动标签
    source = Column(String, default="voice", nullable=False)  # 'voice'|'manual'|'video_parse'
    audio_source = Column(String, nullable=True)  # 'upload'|'external_link'|None
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    # 关联关系
    user = relationship("User", back_populates="fragments")
    folder = relationship("FragmentFolder", back_populates="fragments")
    fragment_tags = relationship("FragmentTag", back_populates="fragment", cascade="all, delete-orphan")
    blocks = relationship("FragmentBlock", back_populates="fragment", cascade="all, delete-orphan", order_by="FragmentBlock.order_index")

    def __repr__(self) -> str:
        return f"<Fragment(id={self.id}, user_id={self.user_id}, source={self.source})>"


class FragmentBlock(Base):
    """碎片块表，用于承载可扩展的 Markdown/图片/音频内容。"""

    __tablename__ = "fragment_blocks"
    __table_args__ = (
        UniqueConstraint("fragment_id", "order_index", name="uq_fragment_blocks_fragment_order"),
        Index("ix_fragment_blocks_fragment_id_order_index", "fragment_id", "order_index"),
    )

    id = Column(String, primary_key=True, default=generate_uuid)
    fragment_id = Column(String, ForeignKey("fragments.id"), nullable=False)
    block_type = Column(String, nullable=False)  # 当前仅支持 markdown
    order_index = Column(Integer, nullable=False, default=0)
    payload_json = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    fragment = relationship("Fragment", back_populates="blocks")

    def __repr__(self) -> str:
        return f"<FragmentBlock(id={self.id}, fragment_id={self.fragment_id}, block_type={self.block_type})>"


class FragmentTag(Base):
    """碎片标签归一化表，为未来 Tag 搜索和聚合做准备。"""

    __tablename__ = "fragment_tags"
    __table_args__ = (
        UniqueConstraint("user_id", "fragment_id", "tag", name="uq_fragment_tags_user_fragment_tag"),
        Index("ix_fragment_tags_user_id_tag", "user_id", "tag"),
    )

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    fragment_id = Column(String, ForeignKey("fragments.id"), nullable=False)
    tag = Column(String(50), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    user = relationship("User", back_populates="fragment_tags")
    fragment = relationship("Fragment", back_populates="fragment_tags")

    def __repr__(self) -> str:
        return f"<FragmentTag(id={self.id}, fragment_id={self.fragment_id}, tag={self.tag})>"


class Script(Base):
    """
    口播稿表

    存储 AI 生成的口播稿内容，支持两种生成模式
    """
    __tablename__ = "scripts"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=True)
    body_html = Column(Text, nullable=False)  # HTML 正文
    mode = Column(String, nullable=False)  # 'mode_a' | 'mode_b'
    source_fragment_ids = Column(String, nullable=True)  # JSON数组字符串，关联碎片ID
    status = Column(String, default="draft", nullable=False)  # 'draft'|'ready'|'filmed'
    is_daily_push = Column(Boolean, default=False, nullable=False)  # 是否每日自动生成
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    # 关联关系
    user = relationship("User", back_populates="scripts")

    def __repr__(self) -> str:
        return f"<Script(id={self.id}, user_id={self.user_id}, mode={self.mode}, status={self.status})>"


class KnowledgeDoc(Base):
    """
    知识库文档表

    存储用户上传的高赞文案或语言习惯文档，用于 Mode B 风格模仿
    """
    __tablename__ = "knowledge_docs"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=False)
    content = Column(Text, nullable=False)  # 由 Markdown 派生的纯文本索引载荷
    body_markdown = Column(Text, nullable=False)  # Markdown 正文
    doc_type = Column(String, nullable=False)  # 'high_likes'|'language_habit'
    vector_ref_id = Column(String, nullable=True)  # 向量库中的引用ID，格式：docs_{user_id}:{doc_id}
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

class PipelineRun(Base):
    """持久化整条后台流水线运行状态。"""

    __tablename__ = "pipeline_runs"
    __table_args__ = (
        Index("ix_pipeline_runs_user_id_created_at", "user_id", "created_at"),
        Index("ix_pipeline_runs_status_next_retry_at", "status", "next_retry_at"),
        Index("ix_pipeline_runs_pipeline_type_created_at", "pipeline_type", "created_at"),
    )

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    pipeline_type = Column(String, nullable=False)
    status = Column(String, default="queued", nullable=False)
    input_payload_json = Column(Text, nullable=True)
    output_payload_json = Column(Text, nullable=True)
    resource_type = Column(String, nullable=True)
    resource_id = Column(String, nullable=True)
    error_message = Column(Text, nullable=True)
    current_step = Column(String, nullable=True)
    next_retry_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    user = relationship("User")
    steps = relationship("PipelineStepRun", back_populates="pipeline_run", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<PipelineRun(id={self.id}, user_id={self.user_id}, pipeline_type={self.pipeline_type}, status={self.status})>"


class PipelineStepRun(Base):
    """持久化单个流水线步骤的执行状态。"""

    __tablename__ = "pipeline_step_runs"
    __table_args__ = (
        UniqueConstraint("pipeline_run_id", "step_name", name="uq_pipeline_step_runs_run_step"),
        Index("ix_pipeline_step_runs_status_available_at", "status", "available_at"),
        Index("ix_pipeline_step_runs_pipeline_run_id_step_order", "pipeline_run_id", "step_order"),
    )

    id = Column(String, primary_key=True, default=generate_uuid)
    pipeline_run_id = Column(String, ForeignKey("pipeline_runs.id"), nullable=False)
    step_name = Column(String, nullable=False)
    step_order = Column(Integer, nullable=False)
    status = Column(String, default="pending", nullable=False)
    attempt_count = Column(Integer, default=0, nullable=False)
    max_attempts = Column(Integer, default=3, nullable=False)
    input_payload_json = Column(Text, nullable=True)
    output_payload_json = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)
    external_ref_json = Column(Text, nullable=True)
    available_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    lock_token = Column(String, nullable=True)
    locked_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    pipeline_run = relationship("PipelineRun", back_populates="steps")

    def __repr__(self) -> str:
        return f"<PipelineStepRun(id={self.id}, pipeline_run_id={self.pipeline_run_id}, step_name={self.step_name}, status={self.status})>"
