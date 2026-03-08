from __future__ import annotations

from pydantic import BaseModel

from modules.fragments.schemas import FragmentItem


class AudioUploadResponse(BaseModel):
    fragment_id: str
    audio_path: str
    relative_path: str
    file_size: int
    duration: float | None = None
    sync_status: str


class TranscriptionStatusResponse(FragmentItem):
    fragment_id: str
