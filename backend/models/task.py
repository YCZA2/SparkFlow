"""
Celery 任务运行状态模型（新异步任务真值）
"""

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from models.database import Base
from models.utils import generate_uuid, utc_now


class TaskRun(Base):
    """持久化整条 Celery 任务链路的运行状态。"""

    __tablename__ = "task_runs"
    __table_args__ = (
        Index("ix_task_runs_user_id_created_at", "user_id", "created_at"),
        Index("ix_task_runs_status_created_at", "status", "created_at"),
        Index("ix_task_runs_task_type_created_at", "task_type", "created_at"),
    )

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    task_type = Column(String, nullable=False)
    status = Column(String, default="queued", nullable=False)
    input_payload_json = Column(Text, nullable=True)
    output_payload_json = Column(Text, nullable=True)
    resource_type = Column(String, nullable=True)
    resource_id = Column(String, nullable=True)
    error_message = Column(Text, nullable=True)
    current_step = Column(String, nullable=True)
    celery_root_id = Column(String, nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    user = relationship("User")
    steps = relationship("TaskStepRun", back_populates="task_run", cascade="all, delete-orphan")

    @property
    def pipeline_type(self) -> str:
        """向 legacy pipeline 兼容层暴露旧字段名。"""
        return self.task_type

    def __repr__(self) -> str:
        return f"<TaskRun(id={self.id}, user_id={self.user_id}, task_type={self.task_type}, status={self.status})>"


class TaskStepRun(Base):
    """持久化单个 Celery 步骤任务的执行状态。"""

    __tablename__ = "task_step_runs"
    __table_args__ = (
        UniqueConstraint("task_run_id", "step_name", name="uq_task_step_runs_run_step"),
        Index("ix_task_step_runs_task_run_id_step_order", "task_run_id", "step_order"),
        Index("ix_task_step_runs_status_started_at", "status", "started_at"),
    )

    id = Column(String, primary_key=True, default=generate_uuid)
    task_run_id = Column(String, ForeignKey("task_runs.id"), nullable=False)
    step_name = Column(String, nullable=False)
    step_order = Column(Integer, nullable=False)
    status = Column(String, default="pending", nullable=False)
    attempt_count = Column(Integer, default=0, nullable=False)
    max_attempts = Column(Integer, default=3, nullable=False)
    celery_task_id = Column(String, nullable=True)
    input_payload_json = Column(Text, nullable=True)
    output_payload_json = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)
    external_ref_json = Column(Text, nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    task_run = relationship("TaskRun", back_populates="steps")

    @property
    def pipeline_run_id(self) -> str:
        """向 legacy pipeline 兼容层暴露旧字段名。"""
        return self.task_run_id

    def __repr__(self) -> str:
        return f"<TaskStepRun(id={self.id}, task_run_id={self.task_run_id}, step_name={self.step_name}, status={self.status})>"
