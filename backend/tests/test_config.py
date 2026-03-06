import os
import unittest

from core.config import Settings


class SettingsTestCase(unittest.TestCase):
    def test_debug_accepts_legacy_release_value(self) -> None:
        original = os.environ.get("DEBUG")
        try:
            os.environ["DEBUG"] = "release"
            settings = Settings()
            self.assertFalse(settings.DEBUG)
        finally:
            if original is None:
                os.environ.pop("DEBUG", None)
            else:
                os.environ["DEBUG"] = original
