"""Dify 导入脚本纯函数测试。"""

from __future__ import annotations

from scripts.import_dify_workflow import (
    normalize_console_api_base,
    normalize_runtime_api_base,
    update_env_text,
)


def test_normalize_runtime_api_base_accepts_root_and_console_urls() -> None:
    """运行时地址标准化应统一落到 `/v1`。"""
    assert normalize_runtime_api_base("http://127.0.0.1:18080") == "http://127.0.0.1:18080/v1"
    assert normalize_runtime_api_base("http://127.0.0.1:18080/v1") == "http://127.0.0.1:18080/v1"
    assert normalize_runtime_api_base("http://127.0.0.1:18080/console/api") == "http://127.0.0.1:18080/v1"


def test_normalize_console_api_base_accepts_root_and_runtime_urls() -> None:
    """console 地址标准化应统一落到 `/console/api`。"""
    assert normalize_console_api_base("http://127.0.0.1:18080") == "http://127.0.0.1:18080/console/api"
    assert normalize_console_api_base("http://127.0.0.1:18080/v1") == "http://127.0.0.1:18080/console/api"
    assert normalize_console_api_base("http://127.0.0.1:18080/console/api") == "http://127.0.0.1:18080/console/api"


def test_update_env_text_replaces_existing_keys_and_appends_missing_ones() -> None:
    """环境文件更新应保留原内容并只改目标键。"""
    original = "\n".join(
        [
            "DEBUG=true",
            "DIFY_BASE_URL=http://old.example.com/v1",
            "",
            "# comment",
        ]
    )
    updated = update_env_text(
        original,
        {
            "DIFY_BASE_URL": "http://127.0.0.1:18080/v1",
            "DIFY_SCRIPT_APP_ID": "app-789",
            "DIFY_API_KEY": "app-123",
            "DIFY_SCRIPT_WORKFLOW_ID": "wf-456",
        },
    )

    assert "DEBUG=true" in updated
    assert "DIFY_BASE_URL=http://127.0.0.1:18080/v1" in updated
    assert "DIFY_SCRIPT_APP_ID=app-789" in updated
    assert "DIFY_API_KEY=app-123" in updated
    assert "DIFY_SCRIPT_WORKFLOW_ID=wf-456" in updated
    assert "http://old.example.com/v1" not in updated
