from __future__ import annotations

from pydantic import BaseModel


class DocumentImportResponse(BaseModel):
    pipeline_run_id: str
    pipeline_type: str
    local_fragment_id: str | None = None
    source_filename: str | None = None
    file_size: int
