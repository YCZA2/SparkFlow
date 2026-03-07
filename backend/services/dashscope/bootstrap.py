from __future__ import annotations

import os
import ssl

import certifi

_CERTIFI_CA_FILE = certifi.where()


def configure_ssl_context() -> str:
    """Configure SSL defaults to use certifi CA bundle in problematic macOS envs."""
    os.environ["SSL_CERT_FILE"] = _CERTIFI_CA_FILE
    os.environ["REQUESTS_CA_BUNDLE"] = _CERTIFI_CA_FILE

    original_create_default_context = ssl.create_default_context

    def _create_default_context_with_certifi(*args, **kwargs):
        if not args and not any(key in kwargs for key in ("cafile", "capath", "cadata")):
            kwargs["cafile"] = _CERTIFI_CA_FILE
        return original_create_default_context(*args, **kwargs)

    ssl.create_default_context = _create_default_context_with_certifi
    ssl._create_default_https_context = _create_default_context_with_certifi

    try:
        import aiohttp.connector

        aiohttp.connector._SSL_CONTEXT_VERIFIED = original_create_default_context(cafile=_CERTIFI_CA_FILE)
    except Exception:
        # aiohttp may be unavailable; leave SDK import to handle it.
        pass

    return _CERTIFI_CA_FILE


CERTIFI_CA_FILE = configure_ssl_context()
