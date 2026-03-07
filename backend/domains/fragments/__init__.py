"""Fragments domain exports with lazy loading to avoid circular imports."""

from __future__ import annotations

from importlib import import_module
from typing import Any

__all__ = [
    "VALID_FRAGMENT_SOURCES",
    "count_fragments",
    "create_fragment",
    "delete_fragment",
    "get_fragment_or_raise",
    "list_fragments",
    "query_similar_fragments",
    "serialize_fragment",
    "serialize_transcribe_status",
]


def __getattr__(name: str) -> Any:
    if name in __all__:
        service = import_module(".service", __name__)
        return getattr(service, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
