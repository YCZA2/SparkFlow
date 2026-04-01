"""配置解析测试。"""

from __future__ import annotations

import pytest

from core.config import BACKEND_DIR, Settings


def test_debug_accepts_legacy_release_value(monkeypatch) -> None:
    """兼容历史 release/debug 风格的 DEBUG 配置。"""
    monkeypatch.setenv("DEBUG", "release")
    settings = Settings()
    assert settings.DEBUG is False


def test_stt_provider_defaults_to_dashscope(monkeypatch) -> None:
    """在未显式配置时仍保持 DashScope 录音文件识别默认值。"""
    monkeypatch.delenv("STT_PROVIDER", raising=False)
    settings = Settings()
    assert settings.STT_PROVIDER == "dashscope"


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


def test_backend_log_paths_are_resolved_from_backend_dir(monkeypatch) -> None:
    """后端日志路径在 .env 中使用相对值时也不受 cwd 影响。"""
    monkeypatch.setenv("BACKEND_LOG_PATH", "./runtime_logs/backend.log")
    monkeypatch.setenv("BACKEND_ERROR_LOG_PATH", "./runtime_logs/backend-error.log")
    settings = Settings()
    assert settings.BACKEND_LOG_PATH == f"{BACKEND_DIR}/runtime_logs/backend.log"
    assert settings.BACKEND_ERROR_LOG_PATH == f"{BACKEND_DIR}/runtime_logs/backend-error.log"


def test_app_env_defaults_to_development(monkeypatch) -> None:
    """未显式声明 APP_ENV 时，后端默认按 development 装配。"""
    monkeypatch.delenv("APP_ENV", raising=False)
    settings = Settings()
    assert settings.APP_ENV == "development"


def test_production_rejects_default_secret_key(monkeypatch) -> None:
    """production 环境必须替换默认 JWT 密钥。"""
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("SECRET_KEY", "change-this-in-production")
    monkeypatch.setenv("ENABLE_TEST_AUTH", "false")
    monkeypatch.setenv("DEBUG", "false")
    monkeypatch.setenv("LOG_LEVEL", "INFO")
    with pytest.raises(ValueError, match="SECRET_KEY"):
        Settings()


def test_production_rejects_test_auth(monkeypatch) -> None:
    """production 环境禁止打开测试登录入口。"""
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("SECRET_KEY", "prod-secret-key")
    monkeypatch.setenv("ENABLE_TEST_AUTH", "true")
    monkeypatch.setenv("DEBUG", "false")
    monkeypatch.setenv("LOG_LEVEL", "INFO")
    with pytest.raises(ValueError, match="ENABLE_TEST_AUTH"):
        Settings()
