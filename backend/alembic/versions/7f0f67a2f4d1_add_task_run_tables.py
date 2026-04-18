"""add task run tables

Revision ID: 7f0f67a2f4d1
Revises: 2c819bf69513
Create Date: 2026-04-18

说明：补齐 Celery 任务真值表，解决旧开发库已处于 consolidated baseline 版本但未包含
`task_runs` / `task_step_runs` 的升级缺口。
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "7f0f67a2f4d1"
down_revision: Union[str, Sequence[str], None] = "2c819bf69513"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """为已存在的 baseline 数据库增量补齐任务表与索引。"""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "task_runs" not in existing_tables:
        op.create_table(
            "task_runs",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("task_type", sa.String(), nullable=False),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("input_payload_json", sa.Text(), nullable=True),
            sa.Column("output_payload_json", sa.Text(), nullable=True),
            sa.Column("resource_type", sa.String(), nullable=True),
            sa.Column("resource_id", sa.String(), nullable=True),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("current_step", sa.String(), nullable=True),
            sa.Column("celery_root_id", sa.String(), nullable=True),
            sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_task_runs_user_id_created_at", "task_runs", ["user_id", "created_at"], unique=False)
        op.create_index("ix_task_runs_status_created_at", "task_runs", ["status", "created_at"], unique=False)
        op.create_index("ix_task_runs_task_type_created_at", "task_runs", ["task_type", "created_at"], unique=False)

    existing_tables = set(inspector.get_table_names())
    if "task_step_runs" not in existing_tables:
        op.create_table(
            "task_step_runs",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("task_run_id", sa.String(), nullable=False),
            sa.Column("step_name", sa.String(), nullable=False),
            sa.Column("step_order", sa.Integer(), nullable=False),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("attempt_count", sa.Integer(), nullable=False),
            sa.Column("max_attempts", sa.Integer(), nullable=False),
            sa.Column("celery_task_id", sa.String(), nullable=True),
            sa.Column("input_payload_json", sa.Text(), nullable=True),
            sa.Column("output_payload_json", sa.Text(), nullable=True),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("external_ref_json", sa.Text(), nullable=True),
            sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["task_run_id"], ["task_runs.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("task_run_id", "step_name", name="uq_task_step_runs_run_step"),
        )
        op.create_index(
            "ix_task_step_runs_task_run_id_step_order",
            "task_step_runs",
            ["task_run_id", "step_order"],
            unique=False,
        )
        op.create_index(
            "ix_task_step_runs_status_started_at",
            "task_step_runs",
            ["status", "started_at"],
            unique=False,
        )


def downgrade() -> None:
    """回滚任务表补丁。"""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "task_step_runs" in existing_tables:
        op.drop_index("ix_task_step_runs_status_started_at", table_name="task_step_runs")
        op.drop_index("ix_task_step_runs_task_run_id_step_order", table_name="task_step_runs")
        op.drop_table("task_step_runs")

    existing_tables = set(inspector.get_table_names())
    if "task_runs" in existing_tables:
        op.drop_index("ix_task_runs_task_type_created_at", table_name="task_runs")
        op.drop_index("ix_task_runs_status_created_at", table_name="task_runs")
        op.drop_index("ix_task_runs_user_id_created_at", table_name="task_runs")
        op.drop_table("task_runs")
