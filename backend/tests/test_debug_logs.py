"""移动端调试日志测试。"""

from __future__ import annotations

import json

from core import settings
from modules.auth.application import TEST_USER_ID


async def test_mobile_debug_logs_use_structured_logging(
    async_client,
    auth_headers_factory,
    tmp_path,
    monkeypatch,
) -> None:
    """移动端调试日志应复用结构化日志链路并带请求上下文。"""
    log_path = tmp_path / "mobile-debug.log"
    monkeypatch.setattr(settings, "MOBILE_DEBUG_LOG_PATH", str(log_path))

    headers = await auth_headers_factory(async_client)
    response = await async_client.post(
        "/api/debug/mobile-logs",
        headers=headers,
        json={
            "timestamp": "2026-03-09T10:20:30.000Z",
            "level": "error",
            "source": "mobile",
            "message": "recording failed",
            "context": {"screen": "shoot", "attempt": 2},
        },
    )

    assert response.status_code == 200
    assert response.json()["data"] == {"path": str(log_path), "appended": True}

    lines = log_path.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 1

    record = json.loads(lines[0])
    assert record["event"] == "mobile_debug_log"
    assert record["path"] == "/api/debug/mobile-logs"
    assert record["module"] == "modules.debug_logs.mobile"
    assert record["user_id"] == TEST_USER_ID
    assert record["client_level"] == "error"
    assert record["client_timestamp"] == "2026-03-09T10:20:30.000Z"
    assert record["source"] == "mobile"
    assert record["mobile_message"] == "recording failed"
    assert record["context"] == {"screen": "shoot", "attempt": 2}
    assert record["request_id"]
