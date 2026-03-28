"""路由契约测试。"""

from __future__ import annotations

from main import create_app


def test_public_api_routes_are_stable() -> None:
    """公开 API 路由集合应保持稳定。"""
    app = create_app(enable_runtime_side_effects=False)
    routes = {
        (route.path, frozenset(getattr(route, "methods", set()) or []))
        for route in app.routes
        if hasattr(route, "path")
    }
    expected = {
        ("/openapi.json", frozenset({"GET"})),
        ("/docs", frozenset({"GET"})),
        ("/docs/oauth2-redirect", frozenset({"GET"})),
        ("/redoc", frozenset({"GET"})),
        ("/", frozenset({"GET"})),
        ("/admin", frozenset({"GET"})),
        ("/health", frozenset({"GET"})),
        ("/api/admin/bootstrap-status", frozenset({"GET"})),
        ("/api/admin/users", frozenset({"GET"})),
        ("/api/admin/users", frozenset({"POST"})),
        ("/api/admin/users/{user_id}", frozenset({"PATCH"})),
        ("/api/admin/users/{user_id}", frozenset({"DELETE"})),
        ("/api/admin/users/{user_id}/reset-password", frozenset({"POST"})),
        ("/api/admin/users/{user_id}/force-logout", frozenset({"POST"})),
        ("/api/auth/register", frozenset({"POST"})),
        ("/api/auth/token", frozenset({"POST"})),
        ("/api/auth/login", frozenset({"POST"})),
        ("/api/auth/me", frozenset({"GET"})),
        ("/api/auth/refresh", frozenset({"POST"})),
        ("/api/auth/logout", frozenset({"POST"})),
        ("/api/backups/batch", frozenset({"POST"})),
        ("/api/backups/snapshot", frozenset({"GET"})),
        ("/api/backups/restore", frozenset({"POST"})),
        ("/api/backups/assets", frozenset({"POST"})),
        ("/api/backups/assets/access", frozenset({"POST"})),
        ("/api/debug/mobile-logs", frozenset({"POST"})),
        ("/api/external-media/audio-imports", frozenset({"POST"})),
        ("/api/exports/markdown/{content_type}/{content_id}", frozenset({"GET"})),
        ("/api/exports/markdown/batch", frozenset({"POST"})),
        ("/api/fragment-folders", frozenset({"GET"})),
        ("/api/fragment-folders", frozenset({"POST"})),
        ("/api/fragment-folders/{folder_id}", frozenset({"PATCH"})),
        ("/api/fragment-folders/{folder_id}", frozenset({"DELETE"})),
        ("/api/fragments/similar", frozenset({"POST"})),
        ("/api/fragments/tags", frozenset({"GET"})),
        ("/api/fragments/visualization", frozenset({"GET"})),
        ("/api/media-assets", frozenset({"GET"})),
        ("/api/media-assets", frozenset({"POST"})),
        ("/api/media-assets/{asset_id}", frozenset({"DELETE"})),
        ("/api/scripts/generation", frozenset({"POST"})),
        ("/api/scripts", frozenset({"GET"})),
        ("/api/scripts/daily-push", frozenset({"GET"})),
        ("/api/scripts/daily-push/trigger", frozenset({"POST"})),
        ("/api/scripts/daily-push/force-trigger", frozenset({"POST"})),
        ("/api/scripts/{script_id}", frozenset({"GET"})),
        ("/api/scripts/{script_id}", frozenset({"PATCH"})),
        ("/api/scripts/{script_id}", frozenset({"DELETE"})),
        ("/api/knowledge", frozenset({"GET"})),
        ("/api/knowledge", frozenset({"POST"})),
        ("/api/knowledge/upload", frozenset({"POST"})),
        ("/api/knowledge/search", frozenset({"POST"})),
        ("/api/knowledge/{doc_id}", frozenset({"GET"})),
        ("/api/knowledge/{doc_id}", frozenset({"PATCH"})),
        ("/api/knowledge/{doc_id}", frozenset({"DELETE"})),
        ("/api/pipelines/{run_id}", frozenset({"GET"})),
        ("/api/pipelines/{run_id}/steps", frozenset({"GET"})),
        ("/api/pipelines/{run_id}/retry", frozenset({"POST"})),
        ("/api/transcriptions", frozenset({"POST"})),
    }

    normalized_routes = {
        (path, frozenset(method for method in methods if method not in {"HEAD", "OPTIONS"}))
        for path, methods in routes
    }
    normalized_routes = {item for item in normalized_routes if item[1]}

    assert normalized_routes == expected


def test_legacy_paths_not_registered() -> None:
    """历史遗留路径不应继续暴露。"""
    app = create_app(enable_runtime_side_effects=False)
    paths = {route.path for route in app.routes}
    assert "/api/transcribe" not in paths
    assert not any(path.startswith("/api/agent") for path in paths)
