from __future__ import annotations

from modules.shared.ports import StoredFile
from modules.shared.stored_file_payloads import stored_file_from_payload, stored_file_to_payload


def test_stored_file_payload_round_trip() -> None:
    """文件 payload 在往返转换后应保持关键字段。"""
    stored_file = StoredFile(
        storage_provider="local",
        bucket="local",
        object_key="audio/demo.m4a",
        access_level="private",
        original_filename="demo.m4a",
        mime_type="audio/m4a",
        file_size=42,
        checksum="abc",
    )

    payload = stored_file_to_payload(stored_file)
    restored = stored_file_from_payload(payload)

    assert restored == stored_file


def test_stored_file_from_payload_returns_none_for_incomplete_data() -> None:
    """缺少关键字段时不应恢复出伪造文件对象。"""
    assert stored_file_from_payload({"bucket": "local"}) is None
