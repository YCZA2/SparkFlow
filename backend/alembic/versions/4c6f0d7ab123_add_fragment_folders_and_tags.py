"""add fragment folders and tags

Revision ID: 4c6f0d7ab123
Revises: 9f2a1a5b2b8c
Create Date: 2026-03-08 11:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "4c6f0d7ab123"
down_revision: Union[str, Sequence[str], None] = "9f2a1a5b2b8c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "fragment_folders",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(length=50), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "name", name="uq_fragment_folders_user_name"),
    )
    op.add_column("fragments", sa.Column("folder_id", sa.String(), nullable=True))
    op.create_foreign_key(
        "fk_fragments_folder_id_fragment_folders",
        "fragments",
        "fragment_folders",
        ["folder_id"],
        ["id"],
    )
    op.create_index("ix_fragments_user_id_folder_id", "fragments", ["user_id", "folder_id"], unique=False)

    op.create_table(
        "fragment_tags",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("fragment_id", sa.String(), nullable=False),
        sa.Column("tag", sa.String(length=50), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["fragment_id"], ["fragments.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "fragment_id", "tag", name="uq_fragment_tags_user_fragment_tag"),
    )
    op.create_index("ix_fragment_tags_user_id_tag", "fragment_tags", ["user_id", "tag"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_fragment_tags_user_id_tag", table_name="fragment_tags")
    op.drop_table("fragment_tags")
    op.drop_index("ix_fragments_user_id_folder_id", table_name="fragments")
    op.drop_constraint("fk_fragments_folder_id_fragment_folders", "fragments", type_="foreignkey")
    op.drop_column("fragments", "folder_id")
    op.drop_table("fragment_folders")
