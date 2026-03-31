"""drop_fragment_projection_tables

Revision ID: b7c8d9e0f1a2
Revises: a1b2c3d4e5f6
Create Date: 2026-03-31 00:00:00.000000

说明：fragment 正文与标签已完全切换到 backup snapshot，本迁移删除旧的
fragments / fragment_tags / fragment_blocks 投影表。
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = "b7c8d9e0f1a2"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 中文注释：先删依赖表，再删 fragments 主表，避免外键约束阻塞。
    op.drop_table("fragment_tags")
    op.drop_table("fragment_blocks")
    op.drop_table("fragments")


def downgrade() -> None:
    # 中文注释：仅恢复旧表结构，开发期数据不回填。
    op.create_table(
        "fragments",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("folder_id", sa.String(), nullable=True),
        sa.Column("audio_storage_provider", sa.String(), nullable=True),
        sa.Column("audio_bucket", sa.String(), nullable=True),
        sa.Column("audio_object_key", sa.String(), nullable=True),
        sa.Column("audio_access_level", sa.String(), nullable=True),
        sa.Column("audio_original_filename", sa.String(), nullable=True),
        sa.Column("audio_mime_type", sa.String(), nullable=True),
        sa.Column("audio_file_size", sa.Integer(), nullable=True),
        sa.Column("audio_checksum", sa.String(), nullable=True),
        sa.Column("transcript", sa.Text(), nullable=True),
        sa.Column("speaker_segments", sa.Text(), nullable=True),
        sa.Column("body_html", sa.Text(), nullable=False, server_default=""),
        sa.Column("plain_text_snapshot", sa.Text(), nullable=False, server_default=""),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("tags", sa.String(), nullable=True),
        sa.Column("source", sa.String(), nullable=False, server_default="voice"),
        sa.Column("audio_source", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["folder_id"], ["fragment_folders.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_fragments_user_id_folder_id", "fragments", ["user_id", "folder_id"])

    op.create_table(
        "fragment_blocks",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("fragment_id", sa.String(), nullable=False),
        sa.Column("block_type", sa.String(), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("payload_json", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["fragment_id"], ["fragments.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("fragment_id", "order_index", name="uq_fragment_blocks_fragment_order"),
    )
    op.create_index("ix_fragment_blocks_fragment_id_order_index", "fragment_blocks", ["fragment_id", "order_index"])

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
    op.create_index("ix_fragment_tags_user_id_tag", "fragment_tags", ["user_id", "tag"])
