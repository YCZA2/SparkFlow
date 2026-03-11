"""配置解析测试。"""

from __future__ import annotations

from core.config import BACKEND_DIR, Settings


def test_debug_accepts_legacy_release_value(monkeypatch) -> None:
    """兼容历史 release/debug 风格的 DEBUG 配置。"""
    monkeypatch.setenv("DEBUG", "release")
    settings = Settings()
    assert settings.DEBUG is False


def test_dashscope_strategy_defaults_to_realtime(monkeypatch) -> None:
    """在未显式配置时仍保持实时转写默认值。"""
    monkeypatch.delenv("STT_DASHSCOPE_STRATEGY", raising=False)
    settings = Settings()
    assert settings.STT_DASHSCOPE_STRATEGY == "realtime"


def test_dify_mode_base_urls_are_normalized(monkeypatch) -> None:
    """自动移除脚本 Dify 基础地址末尾斜杠。"""
    monkeypatch.setenv("DIFY_MODE_A_BASE_URL", "https://dify-a.example.com/v1/")
    monkeypatch.setenv("DIFY_MODE_B_BASE_URL", "https://dify-b.example.com/v1/")
    settings = Settings()
    assert settings.DIFY_MODE_A_BASE_URL == "https://dify-a.example.com/v1"
    assert settings.DIFY_MODE_B_BASE_URL == "https://dify-b.example.com/v1"


def test_upload_dir_is_resolved_from_backend_dir(monkeypatch) -> None:
    """相对上传目录始终以 backend 目录为基准。"""
    monkeypatch.setenv("UPLOAD_DIR", "./uploads")
    settings = Settings()
    assert settings.UPLOAD_DIR == f"{BACKEND_DIR}/uploads"


def test_runtime_log_path_is_resolved_from_backend_dir(monkeypatch) -> None:
    """日志路径在 .env 中使用相对值时也不受 cwd 影响。"""
    monkeypatch.setenv("MOBILE_DEBUG_LOG_PATH", "./runtime_logs/mobile-debug.log")
    settings = Settings()
    assert (
        settings.MOBILE_DEBUG_LOG_PATH
        == f"{BACKEND_DIR}/runtime_logs/mobile-debug.log"
    )
