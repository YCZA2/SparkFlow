"""日志配置测试。"""

from __future__ import annotations

import json
import logging
from logging.handlers import TimedRotatingFileHandler

from core import settings
from core.logging_config import (
    ACCESS_LOGGER_NAME,
    MOBILE_DEBUG_LOGGER_NAME,
    configure_logging,
    get_access_logger,
    get_logger,
)


def _flush_logger_handlers(*logger_names: str) -> None:
    """确保指定 logger 的 handler 在断言前全部刷盘。"""
    target_names = logger_names or ("",)
    for logger_name in target_names:
        for handler in logging.getLogger(logger_name).handlers:
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
    _flush_logger_handlers("")

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

    root_file_handlers = [
        handler
        for handler in logging.getLogger().handlers
        if isinstance(handler, TimedRotatingFileHandler)
    ]
    assert len(root_file_handlers) == 2
    assert all(isinstance(handler, TimedRotatingFileHandler) for handler in root_file_handlers)

    mobile_logger = logging.getLogger(MOBILE_DEBUG_LOGGER_NAME)
    assert mobile_logger.propagate is False
    assert len(mobile_logger.handlers) == 1
    assert isinstance(mobile_logger.handlers[0], TimedRotatingFileHandler)


def test_access_logger_only_writes_to_file(tmp_path, monkeypatch, capsys) -> None:
    """访问日志应只写文件，不额外污染控制台输出。"""
    all_log_path = tmp_path / "backend.log"
    error_log_path = tmp_path / "backend-error.log"
    mobile_log_path = tmp_path / "mobile-debug.log"

    monkeypatch.setattr(settings, "BACKEND_LOG_PATH", str(all_log_path))
    monkeypatch.setattr(settings, "BACKEND_ERROR_LOG_PATH", str(error_log_path))
    monkeypatch.setattr(settings, "MOBILE_DEBUG_LOG_PATH", str(mobile_log_path))

    configure_logging()
    get_access_logger().info(
        "http_request_completed",
        method="GET",
        path="/health",
        status_code=200,
        duration_ms=12,
        request_id="req-test",
    )
    _flush_logger_handlers(ACCESS_LOGGER_NAME)

    captured = capsys.readouterr()
    assert "http_request_completed" not in captured.out
    assert "http_request_completed" not in captured.err

    records = [json.loads(line) for line in all_log_path.read_text(encoding="utf-8").strip().splitlines()]
    assert records[-1]["event"] == "http_request_completed"

    access_logger = logging.getLogger(ACCESS_LOGGER_NAME)
    assert access_logger.propagate is False
    assert all(isinstance(handler, TimedRotatingFileHandler) for handler in access_logger.handlers)


def test_third_party_info_logs_are_quiet_on_console(tmp_path, monkeypatch, capsys) -> None:
    """第三方 INFO 应被压低，应用 warning/error 仍保留控制台可见性。"""
    all_log_path = tmp_path / "backend.log"
    error_log_path = tmp_path / "backend-error.log"
    mobile_log_path = tmp_path / "mobile-debug.log"

    monkeypatch.setattr(settings, "BACKEND_LOG_PATH", str(all_log_path))
    monkeypatch.setattr(settings, "BACKEND_ERROR_LOG_PATH", str(error_log_path))
    monkeypatch.setattr(settings, "MOBILE_DEBUG_LOG_PATH", str(mobile_log_path))

    configure_logging()
    logging.getLogger("httpx").info("httpx_noise")
    logging.getLogger("apscheduler.scheduler").info("apscheduler_noise")
    app_logger = get_logger("tests.console")
    app_logger.warning("app_warning_visible")
    app_logger.error("app_error_visible")
    _flush_logger_handlers("")

    captured = capsys.readouterr()
    assert "httpx_noise" not in captured.out + captured.err
    assert "apscheduler_noise" not in captured.out + captured.err
    assert "app_warning_visible" in captured.out
    assert "app_error_visible" in captured.err
