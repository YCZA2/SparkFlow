from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Optional


def parse_json_list(json_str: Optional[str], allow_csv_fallback: bool = True) -> Optional[list[str]]:
    """Parse a JSON array string into a list of non-empty strings."""
    if not json_str:
        return None

    try:
        parsed = json.loads(json_str)
    except json.JSONDecodeError:
        parsed = None

    if isinstance(parsed, list):
        values = [str(item) for item in parsed if item]
        return values or None

    if not allow_csv_fallback:
        return None

    fallback_values = [item.strip() for item in json_str.split(",") if item.strip()]
    return fallback_values or None


def parse_json_object_list(json_str: Optional[str]) -> Optional[list[dict[str, Any]]]:
    """Parse a JSON array string into a list of dictionaries."""
    if not json_str:
        return None

    try:
        parsed = json.loads(json_str)
    except json.JSONDecodeError:
        return None

    if not isinstance(parsed, list):
        return None

    objects = [item for item in parsed if isinstance(item, dict)]
    return objects or None


def format_iso_datetime(dt: Optional[datetime]) -> Optional[str]:
    """Format datetime for API output."""
    return dt.isoformat() if dt else None
