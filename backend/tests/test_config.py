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

    def test_dashscope_strategy_defaults_to_realtime(self) -> None:
        original = os.environ.get("STT_DASHSCOPE_STRATEGY")
        try:
            os.environ.pop("STT_DASHSCOPE_STRATEGY", None)
            settings = Settings()
            self.assertEqual(settings.STT_DASHSCOPE_STRATEGY, "realtime")
        finally:
            if original is None:
                os.environ.pop("STT_DASHSCOPE_STRATEGY", None)
            else:
                os.environ["STT_DASHSCOPE_STRATEGY"] = original

    def test_dify_base_url_is_normalized(self) -> None:
        original = os.environ.get("DIFY_BASE_URL")
        try:
            os.environ["DIFY_BASE_URL"] = "https://dify.example.com/v1/"
            settings = Settings()
            self.assertEqual(settings.DIFY_BASE_URL, "https://dify.example.com/v1")
        finally:
            if original is None:
                os.environ.pop("DIFY_BASE_URL", None)
            else:
                os.environ["DIFY_BASE_URL"] = original
