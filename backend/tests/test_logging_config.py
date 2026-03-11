"""日志配置测试。"""

from __future__ import annotations

import json
import logging

from core import settings
from core.logging_config import configure_logging, get_logger


def _flush_root_handlers() -> None:
    """确保读取文件前先刷盘。"""
    for handler in logging.getLogger().handlers:
        flush = getattr(handler, "flush", None)
        if callable(flush):
            flush()


def test_backend_logs_are_written_to_split_files(tmp_path, monkeypatch) -> None:
    """普通日志和错误日志应分别写入对应文件。"""
    all_log_path = tmp_path / "backend.log"
    error_log_path = tmp_path / "backend-error.log"
    mobile_log_path = tmp_path / "mobile-debug.log"

    monkeypatch.setattr(settings, "BACKEND_LOG_PATH", str(all_log_path))
    monkeypatch.setattr(settings, "BACKEND_ERROR_LOG_PATH", str(error_log_path))
    monkeypatch.setattr(settings, "MOBILE_DEBUG_LOG_PATH", str(mobile_log_path))

    configure_logging()
    logger = get_logger("tests.logging")
    logger.info("backend_info_event", feature="logging")
    logger.error("backend_error_event", feature="logging")
    _flush_root_handlers()

    all_records = [
        json.loads(line)
        for line in all_log_path.read_text(encoding="utf-8").strip().splitlines()
    ]
    error_records = [
        json.loads(line)
        for line in error_log_path.read_text(encoding="utf-8").strip().splitlines()
    ]

    assert [record["event"] for record in all_records] == [
        "backend_info_event",
        "backend_error_event",
    ]
    assert [record["event"] for record in error_records] == ["backend_error_event"]
    assert error_records[0]["level"] == "error"
