"""remove fragment sync status and agents

Revision ID: e7f8a9b0c1d2
Revises: d4e5f6a7b8c9
Create Date: 2026-03-09 23:45:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e7f8a9b0c1d2"
down_revision: Union[str, Sequence[str], None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """删除旧 Agent 实体和 fragment 同步兼容字段。"""
    op.drop_table("agents")
    op.drop_column("fragments", "sync_status")


def downgrade() -> None:
    """回滚恢复 Agent 表和 fragment 同步兼容字段。"""
    op.add_column(
        "fragments",
        sa.Column("sync_status", sa.String(), nullable=False, server_default="pending"),
    )
    op.alter_column("fragments", "sync_status", server_default=None)
    op.create_table(
        "agents",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("creator_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["creator_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
