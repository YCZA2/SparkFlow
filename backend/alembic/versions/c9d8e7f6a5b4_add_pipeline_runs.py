"""add pipeline runs

Revision ID: c9d8e7f6a5b4
Revises: f3a8d4b5c6e7
Create Date: 2026-03-09 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c9d8e7f6a5b4"
down_revision: Union[str, Sequence[str], None] = "f3a8d4b5c6e7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "pipeline_runs",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("pipeline_type", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("input_payload_json", sa.Text(), nullable=True),
        sa.Column("output_payload_json", sa.Text(), nullable=True),
        sa.Column("resource_type", sa.String(), nullable=True),
        sa.Column("resource_id", sa.String(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("current_step", sa.String(), nullable=True),
        sa.Column("next_retry_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_pipeline_runs_user_id_created_at", "pipeline_runs", ["user_id", "created_at"], unique=False)
    op.create_index("ix_pipeline_runs_status_next_retry_at", "pipeline_runs", ["status", "next_retry_at"], unique=False)
    op.create_index("ix_pipeline_runs_pipeline_type_created_at", "pipeline_runs", ["pipeline_type", "created_at"], unique=False)

    op.create_table(
        "pipeline_step_runs",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("pipeline_run_id", sa.String(), nullable=False),
        sa.Column("step_name", sa.String(), nullable=False),
        sa.Column("step_order", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("attempt_count", sa.Integer(), nullable=False),
        sa.Column("max_attempts", sa.Integer(), nullable=False),
        sa.Column("input_payload_json", sa.Text(), nullable=True),
        sa.Column("output_payload_json", sa.Text(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("external_ref_json", sa.Text(), nullable=True),
        sa.Column("available_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("lock_token", sa.String(), nullable=True),
        sa.Column("locked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["pipeline_run_id"], ["pipeline_runs.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("pipeline_run_id", "step_name", name="uq_pipeline_step_runs_run_step"),
    )
    op.create_index("ix_pipeline_step_runs_status_available_at", "pipeline_step_runs", ["status", "available_at"], unique=False)
    op.create_index(
        "ix_pipeline_step_runs_pipeline_run_id_step_order",
        "pipeline_step_runs",
        ["pipeline_run_id", "step_order"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_pipeline_step_runs_pipeline_run_id_step_order", table_name="pipeline_step_runs")
    op.drop_index("ix_pipeline_step_runs_status_available_at", table_name="pipeline_step_runs")
    op.drop_table("pipeline_step_runs")
    op.drop_index("ix_pipeline_runs_pipeline_type_created_at", table_name="pipeline_runs")
    op.drop_index("ix_pipeline_runs_status_next_retry_at", table_name="pipeline_runs")
    op.drop_index("ix_pipeline_runs_user_id_created_at", table_name="pipeline_runs")
    op.drop_table("pipeline_runs")
