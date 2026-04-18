from __future__ import annotations

from modules.tasks.schemas import TaskSubmissionHandle


class DocumentImportResponse(TaskSubmissionHandle):
    local_fragment_id: str | None = None
    source_filename: str | None = None
    file_size: int
