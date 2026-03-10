from __future__ import annotations

from pydantic import BaseModel, Field


class MarkdownBatchExportRequest(BaseModel):
    fragment_ids: list[str] = Field(default_factory=list, description="需要批量导出的碎片 ID")
    script_ids: list[str] = Field(default_factory=list, description="需要批量导出的脚本 ID")
    knowledge_doc_ids: list[str] = Field(default_factory=list, description="需要批量导出的知识库文档 ID")
