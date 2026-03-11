from __future__ import annotations

import io
import zipfile

from sqlalchemy.orm import Session

from core.exceptions import NotFoundError, ValidationError
from domains.knowledge import repository as knowledge_repository
from domains.media_assets import repository as media_asset_repository
from modules.fragments.application import FragmentCommandService
from modules.fragments.content import render_fragment_markdown
from modules.fragments.mapper import build_media_asset_file, map_media_asset
from modules.scripts.application import ScriptQueryService, map_script
from modules.shared.content_markdown import (
    MarkdownExportFile,
    render_markdown_document,
    sanitize_export_stem,
)
from modules.shared.ports import FileStorage
from .schemas import MarkdownBatchExportRequest


class MarkdownExportUseCase:
    """封装 Markdown 单条导出和批量 zip 导出。"""

    def __init__(self, *, file_storage: FileStorage, vector_store, llm_provider) -> None:
        """装配内容导出所需的文件存储能力。"""
        self.fragment_service = FragmentCommandService(
            file_storage=file_storage,
            vector_store=vector_store,
            llm_provider=llm_provider,
        )
        self.file_storage = file_storage

    def export_fragment(self, *, db: Session, user_id: str, fragment_id: str) -> tuple[MarkdownExportFile, list[tuple[str, bytes]]]:
        """导出单条碎片为 Markdown。"""
        payload = self.fragment_service.get_fragment_payload(db=db, user_id=user_id, fragment_id=fragment_id)
        metadata = {
            "type": "fragment",
            "id": payload.id,
            "source": payload.source,
            "audio_source": payload.audio_source,
            "created_at": payload.created_at,
            "tags": payload.tags or [],
            "folder_id": payload.folder_id,
        }
        body = self._append_media_section(render_fragment_markdown(self.fragment_service.get_fragment(db=db, user_id=user_id, fragment_id=fragment_id)), payload.media_assets)
        filename = f"fragment-{sanitize_export_stem(payload.summary or payload.id, fallback=payload.id)}.md"
        return MarkdownExportFile(filename=filename, content=render_markdown_document(metadata=metadata, body_markdown=body)), self._asset_files(payload.media_assets, db=db, user_id=user_id, content_type="fragment", content_id=fragment_id)

    def export_script(self, *, db: Session, user_id: str, script_id: str) -> tuple[MarkdownExportFile, list[tuple[str, bytes]]]:
        """导出单条脚本为 Markdown。"""
        script = ScriptQueryService().get_script(db=db, user_id=user_id, script_id=script_id)
        payload = map_script(script)
        media_assets = [map_media_asset(item) for item in media_asset_repository.list_content_assets(db=db, user_id=user_id, content_type="script", content_id=script.id)]
        metadata = {
            "type": "script",
            "id": payload.id,
            "title": payload.title,
            "mode": payload.mode,
            "status": payload.status,
            "created_at": payload.created_at,
            "source_fragment_ids": payload.source_fragment_ids,
        }
        body = self._append_media_section(payload.body_markdown or "", media_assets)
        filename = f"script-{sanitize_export_stem(payload.title or payload.id, fallback=payload.id)}.md"
        return MarkdownExportFile(filename=filename, content=render_markdown_document(metadata=metadata, body_markdown=body)), self._asset_files(media_assets, db=db, user_id=user_id, content_type="script", content_id=script_id)

    def export_knowledge_doc(self, *, db: Session, user_id: str, doc_id: str) -> tuple[MarkdownExportFile, list[tuple[str, bytes]]]:
        """导出单条知识库文档为 Markdown。"""
        doc = knowledge_repository.get_by_id(db=db, user_id=user_id, doc_id=doc_id)
        if not doc:
            raise NotFoundError(message="知识库文档不存在或无权访问", resource_type="knowledge_doc", resource_id=doc_id)
        media_assets = [map_media_asset(item) for item in media_asset_repository.list_content_assets(db=db, user_id=user_id, content_type="knowledge", content_id=doc.id)]
        metadata = {
            "type": "knowledge",
            "id": doc.id,
            "title": doc.title,
            "doc_type": doc.doc_type,
            "created_at": doc.created_at.isoformat() if doc.created_at else None,
        }
        body = self._append_media_section(doc.body_markdown or "", media_assets)
        filename = f"knowledge-{sanitize_export_stem(doc.title, fallback=doc.id)}.md"
        return MarkdownExportFile(filename=filename, content=render_markdown_document(metadata=metadata, body_markdown=body)), self._asset_files(media_assets, db=db, user_id=user_id, content_type="knowledge", content_id=doc.id)

    def export_batch(self, *, db: Session, user_id: str, request: MarkdownBatchExportRequest) -> bytes:
        """把多条内容打包为 zip。"""
        if not (request.fragment_ids or request.script_ids or request.knowledge_doc_ids):
            raise ValidationError(message="导出列表不能为空", field_errors={"ids": "至少选择一条内容"})
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as zip_file:
            seen_asset_entries: set[str] = set()
            for fragment_id in request.fragment_ids:
                markdown_file, asset_files = self.export_fragment(db=db, user_id=user_id, fragment_id=fragment_id)
                zip_file.writestr(f"fragments/{markdown_file.filename}", markdown_file.content)
                self._write_asset_files(zip_file=zip_file, asset_files=asset_files, seen_entries=seen_asset_entries)
            for script_id in request.script_ids:
                markdown_file, asset_files = self.export_script(db=db, user_id=user_id, script_id=script_id)
                zip_file.writestr(f"scripts/{markdown_file.filename}", markdown_file.content)
                self._write_asset_files(zip_file=zip_file, asset_files=asset_files, seen_entries=seen_asset_entries)
            for doc_id in request.knowledge_doc_ids:
                markdown_file, asset_files = self.export_knowledge_doc(db=db, user_id=user_id, doc_id=doc_id)
                zip_file.writestr(f"knowledge/{markdown_file.filename}", markdown_file.content)
                self._write_asset_files(zip_file=zip_file, asset_files=asset_files, seen_entries=seen_asset_entries)
        return buffer.getvalue()

    def _asset_files(self, media_assets, *, db: Session, user_id: str, content_type: str, content_id: str) -> list[tuple[str, bytes]]:
        """把素材资源解析成 zip 内路径和字节内容。"""
        actual_assets = media_asset_repository.list_content_assets(db=db, user_id=user_id, content_type=content_type, content_id=content_id)
        files: list[tuple[str, bytes]] = []
        for asset in actual_assets:
            files.append((f"assets/{asset.id}-{asset.original_filename}", self.file_storage.read_bytes(build_media_asset_file(asset))))
        return files

    @staticmethod
    def _append_media_section(body_markdown: str, media_assets) -> str:
        """在导出正文末尾补充素材清单。"""
        body = body_markdown.strip()
        if not media_assets:
            return body
        lines = [body] if body else []
        lines.extend(["", "## Assets", ""])
        for asset in media_assets:
            lines.append(f"- [{asset.original_filename}](assets/{asset.id}-{asset.original_filename})")
        return "\n".join(lines).strip()

    @staticmethod
    def _write_asset_files(*, zip_file: zipfile.ZipFile, asset_files: list[tuple[str, bytes]], seen_entries: set[str]) -> None:
        """把素材文件去重写入 zip。"""
        for archive_name, content in asset_files:
            if archive_name in seen_entries:
                continue
            zip_file.writestr(archive_name, content)
            seen_entries.add(archive_name)
