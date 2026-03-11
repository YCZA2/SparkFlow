"""replace fragment markdown with editor document

Revision ID: a8b9c0d1e2f3
Revises: 2a4b6c8d0e1f
Create Date: 2026-03-11 15:30:00.000000
"""

from __future__ import annotations

import json
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a8b9c0d1e2f3"
down_revision: Union[str, Sequence[str], None] = "2a4b6c8d0e1f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """为碎片新增富文本文档真值并回填旧正文。"""
    op.add_column("fragments", sa.Column("editor_document", sa.JSON(), nullable=True))
    op.add_column("fragments", sa.Column("plain_text_snapshot", sa.Text(), nullable=True))

    connection = op.get_bind()
    fragment_rows = connection.execute(sa.text("SELECT id, transcript FROM fragments")).mappings().all()
    block_rows = connection.execute(
        sa.text(
            """
            SELECT fragment_id, order_index, payload_json
            FROM fragment_blocks
            ORDER BY fragment_id ASC, order_index ASC
            """
        )
    ).mappings().all()

    blocks_by_fragment: dict[str, list[str]] = {}
    for row in block_rows:
        payload_json = row["payload_json"]
        markdown = ""
        if payload_json:
            try:
                payload = json.loads(payload_json)
            except json.JSONDecodeError:
                payload = {}
            markdown = str(payload.get("markdown") or "").strip()
        if markdown:
            blocks_by_fragment.setdefault(row["fragment_id"], []).append(markdown)

    for row in fragment_rows:
        fragment_id = row["id"]
        text_blocks = blocks_by_fragment.get(fragment_id) or []
        plain_text = "\n".join(item.strip() for item in text_blocks if item.strip()).strip()
        if not plain_text:
            plain_text = str(row["transcript"] or "").strip()
        document = _build_document(plain_text)
        snapshot = _extract_plain_text(document)
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
                "fragment_id": fragment_id,
                "editor_document": json.dumps(document, ensure_ascii=False),
                "plain_text_snapshot": snapshot,
            },
        )

    op.alter_column("fragments", "editor_document", existing_type=sa.JSON(), nullable=False)
    op.alter_column("fragments", "plain_text_snapshot", existing_type=sa.Text(), nullable=False)


def downgrade() -> None:
    """回滚碎片富文本字段。"""
    op.drop_column("fragments", "plain_text_snapshot")
    op.drop_column("fragments", "editor_document")


def _build_document(text: str) -> dict[str, object]:
    """把旧正文按最小结构包装为富文本文档。"""
    normalized = text.strip()
    if not normalized:
        return {"type": "doc", "blocks": []}
    return {
        "type": "doc",
        "blocks": [
            {
                "id": "migrated-block-1",
                "type": "paragraph",
                "children": [{"text": normalized, "marks": []}],
            }
        ],
    }


def _extract_plain_text(document: dict[str, object]) -> str:
    """从迁移期构造的文档中生成纯文本快照。"""
    blocks = document.get("blocks") if isinstance(document, dict) else []
    if not isinstance(blocks, list):
        return ""
    parts: list[str] = []
    for block in blocks:
        if not isinstance(block, dict):
            continue
        children = block.get("children")
        if not isinstance(children, list):
            continue
        text = "".join(str(item.get("text") or "") for item in children if isinstance(item, dict)).strip()
        if text:
            parts.append(text)
    return "\n".join(parts).strip()
