from __future__ import annotations

from core.exceptions import ValidationError

from domains.fragment_blocks import repository as fragment_block_repository
from modules.shared.content_markdown import MARKDOWN_BLOCK_TYPE, build_markdown_block_payload
from modules.shared.content_schemas import FragmentBlockInput

from .content import read_fragment_effective_text

VALID_FRAGMENT_BLOCK_TYPES = {MARKDOWN_BLOCK_TYPE}


class FragmentContentService:
    """封装碎片 Markdown 内容块的创建与更新。"""

    def create_initial_content(self, *, db, fragment_id: str, body_markdown: str | None) -> None:
        """在首次建碎片时按需初始化 Markdown 块。"""
        normalized_body = (body_markdown or "").strip()
        if not normalized_body:
            return
        fragment_block_repository.create_markdown_block(
            db=db,
            fragment_id=fragment_id,
            order_index=0,
            payload_json=build_markdown_block_payload(normalized_body),
        )

    def replace_content(
        self,
        *,
        db,
        fragment_id: str,
        body_markdown: str | None,
        blocks: list[FragmentBlockInput] | None,
    ) -> None:
        """把块更新请求统一替换为 Markdown 块列表。"""
        markdown_contents = self.normalize_markdown_blocks(blocks=blocks, body_markdown=body_markdown)
        fragment_block_repository.replace_markdown_blocks(
            db=db,
            fragment_id=fragment_id,
            markdown_contents=[build_markdown_block_payload(item) for item in markdown_contents],
        )

    @staticmethod
    def normalize_markdown_blocks(
        *,
        blocks: list[FragmentBlockInput] | None,
        body_markdown: str | None,
    ) -> list[str]:
        """把块更新请求规整为 Markdown 文本列表。"""
        if blocks is not None:
            markdown_contents: list[str] = []
            for block in blocks:
                if block.type not in VALID_FRAGMENT_BLOCK_TYPES:
                    raise ValidationError(message="暂不支持的碎片块类型", field_errors={"blocks": "当前仅支持 markdown"})
                markdown_contents.append((block.markdown or "").strip())
            return markdown_contents
        if body_markdown is not None:
            normalized = body_markdown.strip()
            return [normalized] if normalized else []
        return []

    @staticmethod
    def read_effective_text(fragment) -> str:
        """读取碎片当前参与衍生计算的正文文本。"""
        return read_fragment_effective_text(fragment)
