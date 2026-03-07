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

    def test_modules_do_not_depend_on_legacy_router_package(self) -> None:
        for path in _iter_python_files("modules"):
            content = path.read_text(encoding="utf-8")
            self.assertNotIn("from routers", content, f"{path} should not import routers")
            self.assertNotIn("import routers", content, f"{path} should not import routers")
