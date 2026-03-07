from __future__ import annotations

from pathlib import Path
import unittest


BACKEND_ROOT = Path(__file__).resolve().parents[1]


def _iter_python_files(relative_dir: str):
    root = BACKEND_ROOT / relative_dir
    for path in sorted(root.rglob("*.py")):
        if "__pycache__" in path.parts:
            continue
        yield path


class ArchitectureBoundaryTestCase(unittest.TestCase):
    def test_legacy_domain_service_files_are_removed(self) -> None:
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
            self.assertFalse(path.exists(), f"legacy file should be removed: {path}")

    def test_router_layer_is_removed(self) -> None:
        legacy_files = list((BACKEND_ROOT / "routers").glob("*.py"))
        self.assertEqual(legacy_files, [], "legacy backend/routers python files should be removed")

    def test_presentation_depends_on_application_not_inverse(self) -> None:
        for path in _iter_python_files("modules"):
            content = path.read_text(encoding="utf-8")
            path_text = str(path)
            if path.name == "presentation.py":
                self.assertNotIn(
                    ".presentation",
                    content,
                    f"{path_text} should not import another presentation module",
                )
            if path.name == "application.py":
                self.assertNotIn(
                    ".presentation",
                    content,
                    f"{path_text} should not depend on presentation layer",
                )
                self.assertNotIn(
                    "from services",
                    content,
                    f"{path_text} should not depend on legacy services layer",
                )
                self.assertNotIn(
                    "import services",
                    content,
                    f"{path_text} should not depend on legacy services layer",
                )

    def test_modules_do_not_depend_on_legacy_router_package(self) -> None:
        for path in _iter_python_files("modules"):
            content = path.read_text(encoding="utf-8")
            self.assertNotIn("from routers", content, f"{path} should not import routers")
            self.assertNotIn("import routers", content, f"{path} should not import routers")

    def test_services_package_does_not_export_business_helpers(self) -> None:
        services_init = (BACKEND_ROOT / "services" / "__init__.py").read_text(encoding="utf-8")
        self.assertNotIn("generate_summary", services_init)
        self.assertNotIn("generate_tags", services_init)
        self.assertNotIn("generate_summary_and_tags", services_init)
        self.assertNotIn("upsert_fragment", services_init)
        self.assertNotIn("query_similar_fragments", services_init)
