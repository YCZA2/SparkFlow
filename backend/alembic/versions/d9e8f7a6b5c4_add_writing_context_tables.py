"""add writing context tables

Revision ID: d9e8f7a6b5c4
Revises: b2c3d4e5f6a7
Create Date: 2026-03-25 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d9e8f7a6b5c4"
down_revision: Union[str, None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "stable_core_profiles",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False, server_default=""),
        sa.Column("source_summary", sa.Text(), nullable=True),
        sa.Column("source_signature", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", name="uq_stable_core_profiles_user_id"),
    )
    op.create_index(
        "ix_stable_core_profiles_user_id_updated_at",
        "stable_core_profiles",
        ["user_id", "updated_at"],
        unique=False,
    )

    op.create_table(
        "methodology_entries",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("source_type", sa.String(), nullable=False),
        sa.Column("source_ref_ids", sa.Text(), nullable=True),
        sa.Column("source_signature", sa.String(), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_methodology_entries_user_id_enabled_updated_at",
        "methodology_entries",
        ["user_id", "enabled", "updated_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_methodology_entries_user_id_enabled_updated_at", table_name="methodology_entries")
    op.drop_table("methodology_entries")
    op.drop_index("ix_stable_core_profiles_user_id_updated_at", table_name="stable_core_profiles")
    op.drop_table("stable_core_profiles")
