from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

from modules.external_media.application import ExternalMediaUseCase
from modules.shared.ports import ExternalMediaResolvedAudio, FileAccess, StoredFile


class FakeFileStorage:
    """提供外链导入 contract 测试所需的对象存储替身。"""

    def __init__(self) -> None:
        self.saved_calls: list[dict[str, str]] = []

    async def save_local_file(
        self,
        *,
        source_path: str,
        object_key: str,
        original_filename: str,
        mime_type: str,
        access_level: str = "private",
    ) -> StoredFile:
        """记录保存参数并返回统一文件元数据。"""
        self.saved_calls.append(
            {
                "source_path": source_path,
                "object_key": object_key,
                "original_filename": original_filename,
                "mime_type": mime_type,
                "access_level": access_level,
            }
        )
        return StoredFile(
            storage_provider="local",
            bucket="local",
            object_key=object_key,
            access_level=access_level,
            original_filename=original_filename,
            mime_type=mime_type,
            file_size=16,
            checksum="checksum",
        )

    def create_download_url(self, stored_file: StoredFile) -> FileAccess:
        """返回稳定的文件访问地址。"""
        return FileAccess(url=f"/uploads/{stored_file.object_key}", expires_at=None)


async def test_import_audio_returns_full_metadata_contract(tmp_path) -> None:
    """外链导入应在响应中返回媒体元数据与统一文件 URL。"""
    temp_audio = tmp_path / "incoming.m4a"
    temp_audio.write_bytes(b"fake-audio")
    file_storage = FakeFileStorage()
    ingestion_service = SimpleNamespace(
        ensure_transcription_available=AsyncMock(),
        ingest_audio=AsyncMock(
            return_value=SimpleNamespace(
                pipeline_run_id="run-001",
                fragment_id="fragment-001",
                source="voice",
                audio_source="external_link",
            )
        ),
    )
    external_media_provider = SimpleNamespace(
        resolve_audio=AsyncMock(
            return_value=ExternalMediaResolvedAudio(
                platform="douyin",
                share_url="https://v.douyin.com/demo",
                media_id="7614713222814088953",
                title="别说了 拿大力胶吧",
                author="老薯的薯",
                cover_url="https://example.com/cover.jpg",
                content_type="video",
                local_audio_path=str(temp_audio),
            )
        )
    )
    use_case = ExternalMediaUseCase(
        ingestion_service=ingestion_service,
        external_media_provider=external_media_provider,
        file_storage=file_storage,
    )

    payload = await use_case.import_audio(
        db=object(),
        user_id="test-user-001",
        share_url="https://v.douyin.com/demo",
        platform="auto",
    )

    assert payload.pipeline_run_id == "run-001"
    assert payload.fragment_id == "fragment-001"
    assert payload.platform == "douyin"
    assert payload.media_id == "7614713222814088953"
    assert payload.title == "别说了 拿大力胶吧"
    assert payload.author == "老薯的薯"
    assert payload.cover_url == "https://example.com/cover.jpg"
    assert payload.content_type == "video"
    assert payload.audio_file_url is not None
    assert "audio/imported/test-user-001/7614713222814088953/douyin/" in payload.audio_file_url
    assert not temp_audio.exists()

    saved_call = file_storage.saved_calls[0]
    assert saved_call["mime_type"] == "audio/m4a"
    assert saved_call["original_filename"].endswith(".m4a")
    ingestion_request = ingestion_service.ingest_audio.await_args.kwargs["request"]
    assert ingestion_request.audio_source == "external_link"
    assert ingestion_request.source_context["media_id"] == "7614713222814088953"
    assert ingestion_request.source_context["audio_file_url"] == payload.audio_file_url


async def test_import_audio_cleans_temp_file_when_storage_fails(tmp_path) -> None:
    """保存对象失败时也应清理解析阶段产生的临时文件。"""
    temp_audio = tmp_path / "incoming.m4a"
    temp_audio.write_bytes(b"fake-audio")
    ingestion_service = SimpleNamespace(
        ensure_transcription_available=AsyncMock(),
        ingest_audio=AsyncMock(),
    )
    external_media_provider = SimpleNamespace(
        resolve_audio=AsyncMock(
            return_value=ExternalMediaResolvedAudio(
                platform="douyin",
                share_url="https://v.douyin.com/demo",
                media_id="7614713222814088953",
                title="标题",
                author="作者",
                cover_url=None,
                content_type="video",
                local_audio_path=str(temp_audio),
            )
        )
    )
    file_storage = SimpleNamespace(save_local_file=AsyncMock(side_effect=RuntimeError("save failed")))
    use_case = ExternalMediaUseCase(
        ingestion_service=ingestion_service,
        external_media_provider=external_media_provider,
        file_storage=file_storage,
    )

    try:
        await use_case.import_audio(
            db=object(),
            user_id="test-user-001",
            share_url="https://v.douyin.com/demo",
            platform="auto",
        )
    except RuntimeError as exc:
        assert str(exc) == "save failed"
    else:
        raise AssertionError("expected save failure")

    assert not temp_audio.exists()
