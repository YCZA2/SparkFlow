"""请求访问日志集成测试。"""

from __future__ import annotations

import json
import logging

import pytest
from httpx import ASGITransport, AsyncClient

from core import settings
from core.logging_config import ACCESS_LOGGER_NAME, configure_logging
from main import create_app

pytestmark = pytest.mark.integration


def _flush_request_log_handlers() -> None:
    """在断言访问日志前刷盘 root 和 access logger。"""
    for logger_name in ("", ACCESS_LOGGER_NAME):
        for handler in logging.getLogger(logger_name).handlers:
            flush = getattr(handler, "flush", None)
            if callable(flush):
                flush()


async def test_http_request_completed_is_written_to_backend_log(tmp_path, monkeypatch) -> None:
    """正常请求应写入结构化完成态 access 日志。"""
    all_log_path = tmp_path / "backend.log"
    error_log_path = tmp_path / "backend-error.log"
    mobile_log_path = tmp_path / "mobile-debug.log"

    monkeypatch.setattr(settings, "BACKEND_LOG_PATH", str(all_log_path))
    monkeypatch.setattr(settings, "BACKEND_ERROR_LOG_PATH", str(error_log_path))
    monkeypatch.setattr(settings, "MOBILE_DEBUG_LOG_PATH", str(mobile_log_path))
    configure_logging()

    app = create_app(enable_runtime_side_effects=False)
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/")

    assert response.status_code == 200
    _flush_request_log_handlers()

    records = [json.loads(line) for line in all_log_path.read_text(encoding="utf-8").strip().splitlines()]
    access_records = [record for record in records if record["event"] == "http_request_completed"]

    assert len(access_records) == 1
    assert access_records[0]["method"] == "GET"
    assert access_records[0]["path"] == "/"
    assert access_records[0]["status_code"] == 200
    assert isinstance(access_records[0]["duration_ms"], int)
    assert access_records[0]["request_id"]


async def test_http_request_failed_is_written_to_error_log(tmp_path, monkeypatch) -> None:
    """未处理异常应写入失败态 access 日志和错误日志文件。"""
    all_log_path = tmp_path / "backend.log"
    error_log_path = tmp_path / "backend-error.log"
    mobile_log_path = tmp_path / "mobile-debug.log"

    monkeypatch.setattr(settings, "BACKEND_LOG_PATH", str(all_log_path))
    monkeypatch.setattr(settings, "BACKEND_ERROR_LOG_PATH", str(error_log_path))
    monkeypatch.setattr(settings, "MOBILE_DEBUG_LOG_PATH", str(mobile_log_path))
    configure_logging()

    app = create_app(enable_runtime_side_effects=False)

    @app.get("/boom")
    async def boom() -> None:
        """制造未处理异常，验证失败态 access 日志分流。"""
        raise RuntimeError("boom")

    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/boom")

    assert response.status_code == 500
    _flush_request_log_handlers()

    error_records = [json.loads(line) for line in error_log_path.read_text(encoding="utf-8").strip().splitlines()]
    error_events = [record["event"] for record in error_records]

    assert "http_request_failed" in error_events
    assert "unhandled_exception" in error_events
