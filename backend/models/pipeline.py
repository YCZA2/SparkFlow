"""
流水线运行状态模型（异步任务队列的持久化真值）
"""

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from models.database import Base
from models.utils import generate_uuid, utc_now


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
