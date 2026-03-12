from __future__ import annotations

from domains.fragments import repository as fragment_repository
from modules.shared.content_html import (
    collect_asset_ids_from_html,
    extract_plain_text_from_html,
    normalize_body_html,
)


class FragmentContentService:
    """封装碎片 HTML 正文的校验、保存与派生读取。"""

    def create_initial_content(self, *, db, fragment, body_html: str | None) -> None:
        """在首次建碎片时写入正文真值和纯文本快照。"""
        normalized_html = normalize_body_html(body_html)
        plain_text_snapshot = extract_plain_text_from_html(normalized_html)
        fragment_repository.update_content(
            db=db,
            fragment=fragment,
            body_html=normalized_html,
            plain_text_snapshot=plain_text_snapshot,
        )

    def replace_content(self, *, db, fragment, body_html: str | None) -> None:
        """整体替换碎片 HTML 正文。"""
        normalized_html = normalize_body_html(body_html)
        plain_text_snapshot = extract_plain_text_from_html(normalized_html)
        fragment_repository.update_content(
            db=db,
            fragment=fragment,
            body_html=normalized_html,
            plain_text_snapshot=plain_text_snapshot,
        )

    def read_effective_text(self, fragment) -> str:
        """读取当前碎片正文快照，供摘要和向量链路复用。"""
        return extract_plain_text_from_html(fragment.body_html)

    def collect_body_asset_ids(self, *, body_html: str | None) -> list[str]:
        """收集正文 HTML 中引用的素材 ID。"""
        return collect_asset_ids_from_html(body_html)

    @staticmethod
    def empty_html() -> str:
        """返回空 HTML，供无正文语音碎片复用。"""
        return ""
