from __future__ import annotations

from pydantic import BaseModel

from modules.fragments.schemas import FragmentItem


class AudioUploadResponse(BaseModel):
    pipeline_run_id: str
    pipeline_type: str
    fragment_id: str | None = None
    audio_path: str | None = None
    relative_path: str | None = None
    file_size: int
    duration: float | None = None
    sync_status: str


class TranscriptionStatusResponse(FragmentItem):
    fragment_id: str
