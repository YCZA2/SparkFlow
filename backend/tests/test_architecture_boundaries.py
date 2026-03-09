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
    ]
    for path in legacy_files:
        assert not path.exists(), f"legacy file should be removed: {path}"


def test_router_layer_is_removed() -> None:
    legacy_files = list((BACKEND_ROOT / "routers").glob("*.py"))
    assert legacy_files == [], "legacy backend/routers python files should be removed"


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
