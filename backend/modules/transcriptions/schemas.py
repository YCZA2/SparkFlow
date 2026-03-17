from __future__ import annotations

from pydantic import BaseModel

from modules.fragments.schemas import FragmentItem


class AudioUploadResponse(BaseModel):
    pipeline_run_id: str
    pipeline_type: str
    fragment_id: str | None = None
    local_fragment_id: str | None = None
    audio_object_key: str | None = None
    audio_file_url: str | None = None
    audio_file_expires_at: str | None = None
    file_size: int
    duration: float | None = None


class TranscriptionStatusResponse(FragmentItem):
    fragment_id: str
