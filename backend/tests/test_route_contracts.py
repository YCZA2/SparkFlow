import os
import unittest

os.environ["DEBUG"] = "false"
os.environ["DATABASE_URL"] = "sqlite:///./test.db"

from main import create_app


class RouteContractTestCase(unittest.TestCase):
    def test_public_api_routes_are_stable(self) -> None:
        app = create_app()
        routes = {
            (route.path, frozenset(getattr(route, "methods", set()) or []))
            for route in app.routes
            if hasattr(route, "path")
        }

        expected = {
            ("/api/auth/token", frozenset({"POST"})),
            ("/api/auth/me", frozenset({"GET"})),
            ("/api/fragments", frozenset({"GET"})),
            ("/api/fragments", frozenset({"POST"})),
            ("/api/fragments/similar", frozenset({"POST"})),
            ("/api/fragments/visualization", frozenset({"GET"})),
            ("/api/scripts/generation", frozenset({"POST"})),
            ("/api/scripts", frozenset({"GET"})),
            ("/api/knowledge", frozenset({"GET"})),
            ("/api/knowledge", frozenset({"POST"})),
            ("/api/transcriptions", frozenset({"POST"})),
            ("/api/transcriptions/{fragment_id}", frozenset({"GET"})),
        }

        normalized_routes = set()
        for path, methods in routes:
            filtered = frozenset(method for method in methods if method not in {"HEAD", "OPTIONS"})
            if filtered:
                normalized_routes.add((path, filtered))

        for item in expected:
            self.assertIn(item, normalized_routes)

    def test_legacy_transcribe_path_not_registered(self) -> None:
        app = create_app()
        paths = {route.path for route in app.routes}
        self.assertNotIn("/api/transcribe", paths)


if __name__ == "__main__":
    unittest.main()
