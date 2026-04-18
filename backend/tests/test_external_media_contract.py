from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from modules.external_media.application import ExternalMediaUseCase


@pytest.mark.asyncio
async def test_import_audio_only_returns_task_handle() -> None:
    """外链导入 use case 应返回统一 task 句柄，而非同步媒体元数据。"""
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
        "task_id": "run-001",
        "task_type": "media_ingestion",
        "status_query_url": "/api/tasks/run-001",
        "fragment_id": "fragment-001",
        "local_fragment_id": None,
        "source": "voice",
        "audio_source": "external_link",
    }
    ingestion_service.ingest_external_media.assert_awaited_once_with(
        db=db,
        user_id="test-user-001",
        share_url="https://v.douyin.com/demo",
        platform="auto",
        folder_id=None,
        local_fragment_id=None,
    )


@pytest.mark.asyncio
async def test_import_audio_passes_folder_id_through_to_ingestion_service() -> None:
    """外链导入 use case 应透传 folder_id 和本地占位 fragment 给底层 ingestion service。"""
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
        local_fragment_id=None,
    )


@pytest.mark.asyncio
async def test_import_audio_passes_local_fragment_id_through_to_ingestion_service() -> None:
    """外链导入 use case 应保留客户端 placeholder fragment 绑定关系。"""
    db = object()
    ingestion_service = SimpleNamespace(
        ingest_external_media=AsyncMock(
            return_value=SimpleNamespace(
                pipeline_run_id="run-003",
                fragment_id="fragment-003",
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
        local_fragment_id="local-fragment-001",
    )

    assert payload.model_dump()["local_fragment_id"] == "local-fragment-001"
    ingestion_service.ingest_external_media.assert_awaited_once_with(
        db=db,
        user_id="test-user-001",
        share_url="https://v.douyin.com/demo",
        platform="douyin",
        folder_id=None,
        local_fragment_id="local-fragment-001",
    )
