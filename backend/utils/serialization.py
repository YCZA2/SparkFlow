from __future__ import annotations

import json
from datetime import datetime
from typing import Optional


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


def format_iso_datetime(dt: Optional[datetime]) -> Optional[str]:
    """Format datetime for API output."""
    return dt.isoformat() if dt else None
