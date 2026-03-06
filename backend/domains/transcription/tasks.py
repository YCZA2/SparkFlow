"""Transcription task orchestration helpers."""

from __future__ import annotations

from fastapi import BackgroundTasks

from .workflow import run_transcription_job


def enqueue_transcription_job(
    background_tasks: BackgroundTasks,
    *,
    audio_path: str,
    fragment_id: str,
    user_id: str,
) -> None:
    """Schedule transcription execution outside the router body."""
    background_tasks.add_task(
        run_transcription_job,
        audio_path=audio_path,
        fragment_id=fragment_id,
        user_id=user_id,
    )
