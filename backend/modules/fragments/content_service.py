from __future__ import annotations

from domains.fragments import repository as fragment_repository
from modules.shared.editor_document import (
    collect_asset_ids_from_document,
    empty_editor_document,
    extract_plain_text_from_document,
    normalize_editor_document,
)


class FragmentContentService:
    """封装碎片富文本正文的校验、保存与派生读取。"""

    def create_initial_content(self, *, db, fragment, editor_document: dict | None) -> None:
        """在首次建碎片时写入正文真值和纯文本快照。"""
        normalized_document = normalize_editor_document(editor_document)
        plain_text_snapshot = extract_plain_text_from_document(normalized_document)
        fragment_repository.update_content(
            db=db,
            fragment=fragment,
            editor_document=normalized_document,
            plain_text_snapshot=plain_text_snapshot,
        )

    def replace_content(self, *, db, fragment, editor_document: dict | None) -> None:
        """整体替换碎片正文文档。"""
        normalized_document = normalize_editor_document(editor_document)
        plain_text_snapshot = extract_plain_text_from_document(normalized_document)
        fragment_repository.update_content(
            db=db,
            fragment=fragment,
            editor_document=normalized_document,
            plain_text_snapshot=plain_text_snapshot,
        )

    def read_effective_text(self, fragment) -> str:
        """读取当前碎片正文快照，供摘要和向量链路复用。"""
        return extract_plain_text_from_document(normalize_editor_document(fragment.editor_document))

    def collect_document_asset_ids(self, *, editor_document: dict | None) -> list[str]:
        """收集正文内嵌节点引用的素材 ID。"""
        return collect_asset_ids_from_document(normalize_editor_document(editor_document))

    @staticmethod
    def empty_document() -> dict:
        """返回空文档，供无正文语音碎片复用。"""
        return empty_editor_document()
