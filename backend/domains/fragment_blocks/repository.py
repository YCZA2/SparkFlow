"""Data access helpers for fragment blocks."""

from __future__ import annotations

from sqlalchemy.orm import Session

from models import FragmentBlock


def list_by_fragment(db: Session, *, fragment_id: str) -> list[FragmentBlock]:
    """按顺序返回碎片下的全部内容块。"""
    return (
        db.query(FragmentBlock)
        .filter(FragmentBlock.fragment_id == fragment_id)
        .order_by(FragmentBlock.order_index.asc(), FragmentBlock.created_at.asc())
        .all()
    )


def replace_markdown_blocks(db: Session, *, fragment_id: str, markdown_contents: list[str]) -> list[FragmentBlock]:
    """用新的 Markdown 块列表整体替换碎片内容。"""
    db.query(FragmentBlock).filter(FragmentBlock.fragment_id == fragment_id).delete()
    blocks: list[FragmentBlock] = []
    for index, markdown in enumerate(markdown_contents):
        block = FragmentBlock(
            fragment_id=fragment_id,
            block_type="markdown",
            order_index=index,
            payload_json=markdown,
        )
        db.add(block)
        blocks.append(block)
    db.commit()
    for block in blocks:
        db.refresh(block)
    return blocks


def create_markdown_block(db: Session, *, fragment_id: str, order_index: int, payload_json: str) -> FragmentBlock:
    """为碎片追加一个 Markdown 块。"""
    block = FragmentBlock(
        fragment_id=fragment_id,
        block_type="markdown",
        order_index=order_index,
        payload_json=payload_json,
    )
    db.add(block)
    db.commit()
    db.refresh(block)
    return block
