from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from modules.external_media.application import ExternalMediaUseCase


@pytest.mark.asyncio
async def test_import_audio_only_returns_pipeline_handle() -> None:
    """外链导入 use case 应只返回任务句柄，不同步暴露媒体元数据。"""
    db = object()
    ingestion_service = SimpleNamespace(
        ingest_external_media=AsyncMock(
            return_value=SimpleNamespace(
                pipeline_run_id="run-001",
                fragment_id="fragment-001",
                source="voice",
                audio_source="external_link",
            )
        ),
    )
    use_case = ExternalMediaUseCase(ingestion_service=ingestion_service)

    payload = await use_case.import_audio(
        db=db,
        user_id="test-user-001",
        share_url="https://v.douyin.com/demo",
        platform="auto",
    )

    assert payload.model_dump() == {
        "pipeline_run_id": "run-001",
        "pipeline_type": "media_ingestion",
        "fragment_id": "fragment-001",
        "source": "voice",
        "audio_source": "external_link",
    }
    ingestion_service.ingest_external_media.assert_awaited_once_with(
        db=db,
        user_id="test-user-001",
        share_url="https://v.douyin.com/demo",
        platform="auto",
        folder_id=None,
    )


@pytest.mark.asyncio
async def test_import_audio_passes_folder_id_through_to_ingestion_service() -> None:
    """外链导入 use case 应透传 folder_id 给底层 ingestion service。"""
    db = object()
    ingestion_service = SimpleNamespace(
        ingest_external_media=AsyncMock(
            return_value=SimpleNamespace(
                pipeline_run_id="run-002",
                fragment_id="fragment-002",
                source="voice",
                audio_source="external_link",
            )
        ),
    )
    use_case = ExternalMediaUseCase(ingestion_service=ingestion_service)

    payload = await use_case.import_audio(
        db=db,
        user_id="test-user-001",
        share_url="https://v.douyin.com/demo",
        platform="douyin",
        folder_id="folder-001",
    )

    assert payload.model_dump()["fragment_id"] == "fragment-002"
    ingestion_service.ingest_external_media.assert_awaited_once_with(
        db=db,
        user_id="test-user-001",
        share_url="https://v.douyin.com/demo",
        platform="douyin",
        folder_id="folder-001",
    )
