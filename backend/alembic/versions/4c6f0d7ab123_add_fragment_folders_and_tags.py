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
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = set(inspector.get_table_names())

    if "fragment_folders" not in table_names:
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

    fragment_columns = {column["name"] for column in inspector.get_columns("fragments")}
    fragment_foreign_keys = {foreign_key["name"] for foreign_key in inspector.get_foreign_keys("fragments")}
    fragment_indexes = {index["name"] for index in inspector.get_indexes("fragments")}

    with op.batch_alter_table("fragments") as batch_op:
        if "folder_id" not in fragment_columns:
            batch_op.add_column(sa.Column("folder_id", sa.String(), nullable=True))
        if "fk_fragments_folder_id_fragment_folders" not in fragment_foreign_keys:
            batch_op.create_foreign_key(
                "fk_fragments_folder_id_fragment_folders",
                "fragment_folders",
                ["folder_id"],
                ["id"],
            )

    if "ix_fragments_user_id_folder_id" not in fragment_indexes:
        op.create_index("ix_fragments_user_id_folder_id", "fragments", ["user_id", "folder_id"], unique=False)

    if "fragment_tags" not in table_names:
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

    fragment_tag_indexes = {index["name"] for index in inspector.get_indexes("fragment_tags")} if "fragment_tags" in set(sa.inspect(bind).get_table_names()) else set()
    if "ix_fragment_tags_user_id_tag" not in fragment_tag_indexes:
        op.create_index("ix_fragment_tags_user_id_tag", "fragment_tags", ["user_id", "tag"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_fragment_tags_user_id_tag", table_name="fragment_tags")
    op.drop_table("fragment_tags")
    op.drop_index("ix_fragments_user_id_folder_id", table_name="fragments")
    op.drop_constraint("fk_fragments_folder_id_fragment_folders", "fragments", type_="foreignkey")
    op.drop_column("fragments", "folder_id")
    op.drop_table("fragment_folders")
