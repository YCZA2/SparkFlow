"""add agent runs

Revision ID: f3a8d4b5c6e7
Revises: b7f4c2d91e6a
Create Date: 2026-03-08 18:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f3a8d4b5c6e7"
down_revision: Union[str, Sequence[str], None] = "b7f4c2d91e6a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "agent_runs",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("workflow_type", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("mode", sa.String(), nullable=False),
        sa.Column("dify_workflow_id", sa.String(), nullable=True),
        sa.Column("dify_run_id", sa.String(), nullable=True),
        sa.Column("request_payload_json", sa.Text(), nullable=True),
        sa.Column("result_payload_json", sa.Text(), nullable=True),
        sa.Column("source_fragment_ids", sa.Text(), nullable=True),
        sa.Column("query_hint", sa.Text(), nullable=True),
        sa.Column("include_web_search", sa.Boolean(), nullable=False),
        sa.Column("script_id", sa.String(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["script_id"], ["scripts.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_agent_runs_user_id_created_at", "agent_runs", ["user_id", "created_at"], unique=False)
    op.create_index("ix_agent_runs_status_created_at", "agent_runs", ["status", "created_at"], unique=False)
    op.create_index("ix_agent_runs_dify_run_id", "agent_runs", ["dify_run_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_agent_runs_dify_run_id", table_name="agent_runs")
    op.drop_index("ix_agent_runs_status_created_at", table_name="agent_runs")
    op.drop_index("ix_agent_runs_user_id_created_at", table_name="agent_runs")
    op.drop_table("agent_runs")
