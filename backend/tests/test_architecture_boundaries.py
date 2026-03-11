"""架构边界测试。"""

from __future__ import annotations

from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]


def _iter_python_files(relative_dir: str):
    """遍历目标目录下的 Python 文件。"""
    root = BACKEND_ROOT / relative_dir
    for path in sorted(root.rglob("*.py")):
        if "__pycache__" in path.parts:
            continue
        yield path


def test_legacy_domain_service_files_are_removed() -> None:
    legacy_files = [
        BACKEND_ROOT / "domains" / "fragments" / "service.py",
        BACKEND_ROOT / "domains" / "knowledge" / "service.py",
        BACKEND_ROOT / "domains" / "scripts" / "service.py",
        BACKEND_ROOT / "domains" / "transcription" / "service.py",
        BACKEND_ROOT / "domains" / "transcription" / "upload.py",
        BACKEND_ROOT / "domains" / "transcription" / "tasks.py",
        BACKEND_ROOT / "domains" / "transcription" / "workflow.py",
        BACKEND_ROOT / "services" / "scheduler.py",
        BACKEND_ROOT / "services" / "stt_service.py",
    ]
    for path in legacy_files:
        assert not path.exists(), f"legacy file should be removed: {path}"


def test_router_layer_is_removed() -> None:
    """旧路由目录应整体删除，避免回流到历史结构。"""
    assert not (BACKEND_ROOT / "routers").exists(), "legacy backend/routers directory should be removed"


def test_global_schema_directory_is_removed() -> None:
    """旧全局 schema 目录应保持不存在。"""
    assert not (BACKEND_ROOT / "schemas").exists(), "legacy backend/schemas directory should be removed"


def test_presentation_depends_on_application_not_inverse() -> None:
    for path in _iter_python_files("modules"):
        content = path.read_text(encoding="utf-8")
        path_text = str(path)
        if path.name == "presentation.py":
            assert ".presentation" not in content, f"{path_text} should not import another presentation module"
        if path.name == "application.py":
            assert ".presentation" not in content, f"{path_text} should not depend on presentation layer"
            assert "from services" not in content, f"{path_text} should not depend on legacy services layer"
            assert "import services" not in content, f"{path_text} should not depend on legacy services layer"


def test_modules_do_not_depend_on_legacy_router_package() -> None:
    for path in _iter_python_files("modules"):
        content = path.read_text(encoding="utf-8")
        assert "from routers" not in content, f"{path} should not import routers"
        assert "import routers" not in content, f"{path} should not import routers"


def test_services_package_does_not_export_business_helpers() -> None:
    services_init = (BACKEND_ROOT / "services" / "__init__.py").read_text(encoding="utf-8")
    assert "generate_summary" not in services_init
    assert "generate_tags" not in services_init
    assert "generate_summary_and_tags" not in services_init
    assert "upsert_fragment" not in services_init
    assert "query_similar_fragments" not in services_init


def test_shared_infrastructure_is_split_into_focused_modules() -> None:
    """共享基础设施应拆分为存储、向量和 provider 模块。"""
    expected_files = [
        BACKEND_ROOT / "modules" / "shared" / "storage.py",
        BACKEND_ROOT / "modules" / "shared" / "vector_store.py",
        BACKEND_ROOT / "modules" / "shared" / "providers.py",
    ]
    for path in expected_files:
        assert path.exists(), f"expected split module missing: {path}"
