"""switch fragments and scripts to body_html

Revision ID: c1d2e3f4a5b6
Revises: 6a7b8c9d0e1f, b1c2d3e4f5a6
Create Date: 2026-03-12 18:30:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

from modules.shared.content_html import convert_html_to_markdown, convert_markdown_to_basic_html


# revision identifiers, used by Alembic.
revision: str = "c1d2e3f4a5b6"
down_revision: Union[str, Sequence[str], None] = ("6a7b8c9d0e1f", "b1c2d3e4f5a6")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """把 fragments 和 scripts 正文真值切换为 HTML。"""
    op.add_column("fragments", sa.Column("body_html", sa.Text(), nullable=True))
    op.add_column("scripts", sa.Column("body_html", sa.Text(), nullable=True))

    connection = op.get_bind()

    fragment_rows = connection.execute(
        sa.text("SELECT id, body_markdown FROM fragments")
    ).mappings().all()
    for row in fragment_rows:
        connection.execute(
            sa.text("UPDATE fragments SET body_html = :body_html WHERE id = :fragment_id"),
            {
                "fragment_id": row["id"],
                "body_html": convert_markdown_to_basic_html(row["body_markdown"]),
            },
        )

    script_rows = connection.execute(
        sa.text("SELECT id, body_markdown FROM scripts")
    ).mappings().all()
    for row in script_rows:
        connection.execute(
            sa.text("UPDATE scripts SET body_html = :body_html WHERE id = :script_id"),
            {
                "script_id": row["id"],
                "body_html": convert_markdown_to_basic_html(row["body_markdown"]),
            },
        )

    op.alter_column("fragments", "body_html", existing_type=sa.Text(), nullable=False)
    op.alter_column("scripts", "body_html", existing_type=sa.Text(), nullable=False)
    op.drop_column("fragments", "body_markdown")
    op.drop_column("scripts", "body_markdown")


def downgrade() -> None:
    """回滚为 Markdown 真值，并从 HTML 回填旧字段。"""
    op.add_column("fragments", sa.Column("body_markdown", sa.Text(), nullable=True))
    op.add_column("scripts", sa.Column("body_markdown", sa.Text(), nullable=True))

    connection = op.get_bind()

    fragment_rows = connection.execute(
        sa.text("SELECT id, body_html FROM fragments")
    ).mappings().all()
    for row in fragment_rows:
        connection.execute(
            sa.text("UPDATE fragments SET body_markdown = :body_markdown WHERE id = :fragment_id"),
            {
                "fragment_id": row["id"],
                "body_markdown": convert_html_to_markdown(row["body_html"]),
            },
        )

    script_rows = connection.execute(
        sa.text("SELECT id, body_html FROM scripts")
    ).mappings().all()
    for row in script_rows:
        connection.execute(
            sa.text("UPDATE scripts SET body_markdown = :body_markdown WHERE id = :script_id"),
            {
                "script_id": row["id"],
                "body_markdown": convert_html_to_markdown(row["body_html"]),
            },
        )

    op.alter_column("fragments", "body_markdown", existing_type=sa.Text(), nullable=False)
    op.alter_column("scripts", "body_markdown", existing_type=sa.Text(), nullable=False)
    op.drop_column("fragments", "body_html")
    op.drop_column("scripts", "body_html")
