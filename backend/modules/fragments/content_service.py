from __future__ import annotations

from domains.fragments import repository as fragment_repository
from modules.shared.fragment_body_markdown import (
    collect_asset_ids_from_body_markdown,
    extract_plain_text_from_body_markdown,
    normalize_fragment_body_markdown,
)


class FragmentContentService:
    """封装碎片 Markdown 正文的校验、保存与派生读取。"""

    def create_initial_content(self, *, db, fragment, body_markdown: str | None) -> None:
        """在首次建碎片时写入正文真值和纯文本快照。"""
        normalized_markdown = normalize_fragment_body_markdown(body_markdown)
        plain_text_snapshot = extract_plain_text_from_body_markdown(normalized_markdown)
        fragment_repository.update_content(
            db=db,
            fragment=fragment,
            body_markdown=normalized_markdown,
            plain_text_snapshot=plain_text_snapshot,
        )

    def replace_content(self, *, db, fragment, body_markdown: str | None) -> None:
        """整体替换碎片 Markdown 正文。"""
        normalized_markdown = normalize_fragment_body_markdown(body_markdown)
        plain_text_snapshot = extract_plain_text_from_body_markdown(normalized_markdown)
        fragment_repository.update_content(
            db=db,
            fragment=fragment,
            body_markdown=normalized_markdown,
            plain_text_snapshot=plain_text_snapshot,
        )

    def read_effective_text(self, fragment) -> str:
        """读取当前碎片正文快照，供摘要和向量链路复用。"""
        return extract_plain_text_from_body_markdown(fragment.body_markdown)

    def collect_body_asset_ids(self, *, body_markdown: str | None) -> list[str]:
        """收集正文 Markdown 中引用的素材 ID。"""
        return collect_asset_ids_from_body_markdown(body_markdown)

    @staticmethod
    def empty_markdown() -> str:
        """返回空 Markdown，供无正文语音碎片复用。"""
        return ""
