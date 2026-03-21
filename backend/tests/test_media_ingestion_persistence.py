from __future__ import annotations

from modules.shared.media.media_ingestion_persistence import MediaIngestionPersistenceService
from modules.shared.ports import FileAccess, StoredFile


class StubFileStorage:
    """提供固定下载地址的文件存储替身。"""

    def create_download_url(self, stored_file: StoredFile) -> FileAccess:
        """为测试文件返回稳定 URL。"""
        return FileAccess(url=f"/download/{stored_file.object_key}", expires_at="2099-01-01T00:00:00+00:00")


def test_build_finalize_payload_keeps_upload_fields() -> None:
    """上传音频终态应保留录音字段与下载地址。"""
    service = MediaIngestionPersistenceService()
    result = service.build_finalize_payload(
        file_storage=StubFileStorage(),
        input_payload={
            "fragment_id": "frag-1",
            "source_kind": "upload",
            "audio_file": {
                "storage_provider": "local",
                "bucket": "local",
                "object_key": "audio/a.m4a",
                "access_level": "private",
                "original_filename": "a.m4a",
                "mime_type": "audio/m4a",
                "file_size": 1,
                "checksum": None,
            },
            "source_context": {},
        },
        audio_payload={},
        transcript_payload={"transcript": "你好"},
        enrichment_payload={"summary": "摘要", "tags": ["标签"]},
    )

    assert result["resource_id"] == "frag-1"
    assert result["run_output"]["audio_source"] == "upload"
    assert result["run_output"]["audio_file_url"] == "/download/audio/a.m4a"
    assert result["run_output"]["speaker_segments"] == []


def test_build_finalize_payload_includes_speaker_segments() -> None:
    """转写步骤产出的说话人分段应透传到终态输出。"""
    service = MediaIngestionPersistenceService()
    segments = [
        {"speaker_id": "SPEAKER_0", "start_ms": 0, "end_ms": 1200, "text": "你好"},
        {"speaker_id": "SPEAKER_1", "start_ms": 1300, "end_ms": 2500, "text": "世界"},
    ]
    result = service.build_finalize_payload(
        file_storage=StubFileStorage(),
        input_payload={
            "fragment_id": "frag-3",
            "source_kind": "upload",
            "audio_file": {
                "storage_provider": "local",
                "bucket": "local",
                "object_key": "audio/c.m4a",
                "access_level": "private",
                "original_filename": "c.m4a",
                "mime_type": "audio/m4a",
                "file_size": 1,
                "checksum": None,
            },
            "source_context": {},
        },
        audio_payload={},
        transcript_payload={"transcript": "你好世界", "speaker_segments": segments},
        enrichment_payload={"summary": "摘要", "tags": []},
    )

    assert result["run_output"]["speaker_segments"] == segments


def test_build_finalize_payload_merges_external_media_context() -> None:
    """外链导入终态应优先回填步骤产出的媒体上下文。"""
    service = MediaIngestionPersistenceService()
    result = service.build_finalize_payload(
        file_storage=StubFileStorage(),
        input_payload={
            "fragment_id": "frag-2",
            "source_kind": "external_link",
            "audio_file": None,
            "source_context": {"platform": "douyin", "share_url": "https://old.example.com"},
        },
        audio_payload={
            "audio_file": {
                "storage_provider": "local",
                "bucket": "local",
                "object_key": "audio/b.m4a",
                "access_level": "private",
                "original_filename": "b.m4a",
                "mime_type": "audio/m4a",
                "file_size": 1,
                "checksum": None,
            },
            "platform": "douyin",
            "share_url": "https://new.example.com",
            "media_id": "media-1",
            "title": "标题",
            "author": "作者",
            "cover_url": "https://img.example.com/1.png",
            "content_type": "video",
        },
        transcript_payload={"transcript": "你好"},
        enrichment_payload={"summary": "摘要", "tags": ["标签"]},
    )

    assert result["run_output"]["platform"] == "douyin"
    assert result["run_output"]["share_url"] == "https://new.example.com"
    assert result["run_output"]["media_id"] == "media-1"
    assert result["run_output"]["audio_file_url"] == "/download/audio/b.m4a"
