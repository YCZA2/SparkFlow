from __future__ import annotations

from modules.tasks.schemas import TaskSubmissionHandle


class AudioUploadResponse(TaskSubmissionHandle):
    fragment_id: str | None = None
    local_fragment_id: str | None = None
    audio_object_key: str | None = None
    audio_file_url: str | None = None
    audio_file_expires_at: str | None = None
    file_size: int
    duration: float | None = None
