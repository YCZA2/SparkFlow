"""switch fragments to body_markdown truth

Revision ID: b1c2d3e4f5a6
Revises: a8b9c0d1e2f3
Create Date: 2026-03-11 20:30:00.000000
"""

from __future__ import annotations

import json
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

from modules.shared.editor_document import build_document_from_text
from modules.shared.fragment_body_markdown import (
    convert_editor_document_to_body_markdown,
    extract_plain_text_from_body_markdown,
)


# revision identifiers, used by Alembic.
revision: str = "b1c2d3e4f5a6"
down_revision: Union[str, Sequence[str], None] = "a8b9c0d1e2f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """把 fragments 正文真值切换为 Markdown，并回填旧富文本数据。"""
    op.add_column("fragments", sa.Column("body_markdown", sa.Text(), nullable=True))

    connection = op.get_bind()
    rows = connection.execute(
        sa.text("SELECT id, editor_document, plain_text_snapshot FROM fragments")
    ).mappings().all()

    for row in rows:
        raw_document = row["editor_document"]
        if isinstance(raw_document, str):
            try:
                raw_document = json.loads(raw_document)
            except json.JSONDecodeError:
                raw_document = None
        body_markdown = convert_editor_document_to_body_markdown(raw_document)
        plain_text_snapshot = extract_plain_text_from_body_markdown(body_markdown)
        connection.execute(
            sa.text(
                """
                UPDATE fragments
                SET body_markdown = :body_markdown,
                    plain_text_snapshot = :plain_text_snapshot
                WHERE id = :fragment_id
                """
            ),
            {
                "fragment_id": row["id"],
                "body_markdown": body_markdown,
                "plain_text_snapshot": plain_text_snapshot,
            },
        )

    op.alter_column("fragments", "body_markdown", existing_type=sa.Text(), nullable=False)
    op.drop_column("fragments", "editor_document")


def downgrade() -> None:
    """回滚为 editor_document 真值，并把 Markdown 退化为最小富文本结构。"""
    op.add_column("fragments", sa.Column("editor_document", sa.JSON(), nullable=True))

    connection = op.get_bind()
    rows = connection.execute(
        sa.text("SELECT id, body_markdown, plain_text_snapshot FROM fragments")
    ).mappings().all()

    for row in rows:
        body_markdown = str(row["body_markdown"] or "").strip()
        plain_text_snapshot = str(row["plain_text_snapshot"] or "").strip()
        document = build_document_from_text(body_markdown or plain_text_snapshot)
        connection.execute(
            sa.text(
                """
                UPDATE fragments
                SET editor_document = :editor_document,
                    plain_text_snapshot = :plain_text_snapshot
                WHERE id = :fragment_id
                """
            ),
            {
                "fragment_id": row["id"],
                "editor_document": json.dumps(document, ensure_ascii=False),
                "plain_text_snapshot": plain_text_snapshot,
            },
        )

    op.alter_column("fragments", "editor_document", existing_type=sa.JSON(), nullable=False)
    op.drop_column("fragments", "body_markdown")
