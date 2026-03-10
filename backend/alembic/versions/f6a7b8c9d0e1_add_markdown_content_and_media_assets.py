"""add markdown content and media assets

Revision ID: f6a7b8c9d0e1
Revises: d4e5f6a7b8c9
Create Date: 2026-03-10 15:30:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "f6a7b8c9d0e1"
down_revision = "d4e5f6a7b8c9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """新增 Markdown 内容字段、碎片块和统一媒体资源表。"""
    op.add_column("fragments", sa.Column("capture_text", sa.Text(), nullable=True))
    op.add_column("scripts", sa.Column("body_markdown", sa.Text(), nullable=True))
    op.add_column("knowledge_docs", sa.Column("body_markdown", sa.Text(), nullable=True))

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
        "media_assets",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("media_kind", sa.String(), nullable=False),
        sa.Column("original_filename", sa.String(), nullable=False),
        sa.Column("mime_type", sa.String(), nullable=False),
        sa.Column("storage_path", sa.String(), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("checksum", sa.String(), nullable=True),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="ready"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_media_assets_user_id_created_at", "media_assets", ["user_id", "created_at"])
    op.create_index("ix_media_assets_user_id_media_kind", "media_assets", ["user_id", "media_kind"])

    op.create_table(
        "content_media_links",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("media_asset_id", sa.String(), nullable=False),
        sa.Column("content_type", sa.String(), nullable=False),
        sa.Column("content_id", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False, server_default="attachment"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["media_asset_id"], ["media_assets.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("media_asset_id", "content_type", "content_id", "role", name="uq_content_media_links_asset_content_role"),
    )
    op.create_index("ix_content_media_links_content_type_content_id", "content_media_links", ["content_type", "content_id"])

    op.execute("UPDATE fragments SET capture_text = transcript WHERE transcript IS NOT NULL")
    op.execute("UPDATE scripts SET body_markdown = content WHERE content IS NOT NULL")
    op.execute("UPDATE knowledge_docs SET body_markdown = content WHERE content IS NOT NULL")


def downgrade() -> None:
    """回滚 Markdown 内容与媒体资源结构。"""
    op.drop_index("ix_content_media_links_content_type_content_id", table_name="content_media_links")
    op.drop_table("content_media_links")

    op.drop_index("ix_media_assets_user_id_media_kind", table_name="media_assets")
    op.drop_index("ix_media_assets_user_id_created_at", table_name="media_assets")
    op.drop_table("media_assets")

    op.drop_index("ix_fragment_blocks_fragment_id_order_index", table_name="fragment_blocks")
    op.drop_table("fragment_blocks")

    op.drop_column("knowledge_docs", "body_markdown")
    op.drop_column("scripts", "body_markdown")
    op.drop_column("fragments", "capture_text")
