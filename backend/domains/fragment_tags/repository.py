"""Data access helpers for normalized fragment tags."""

from __future__ import annotations

import json
from typing import Iterable

from sqlalchemy.orm import Session

from models import FragmentTag


def normalize_tags(tags: Iterable[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for raw in tags:
        tag = str(raw or "").strip()
        if not tag or tag in seen:
            continue
        seen.add(tag)
        normalized.append(tag[:50])
    return normalized


def parse_tags_json(tags_json: str | None) -> list[str]:
    if not tags_json:
        return []
    try:
        parsed = json.loads(tags_json)
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []
    return normalize_tags(str(item) for item in parsed)


def replace_for_fragment(
    db: Session,
    *,
    user_id: str,
    fragment_id: str,
    tags: Iterable[str],
) -> None:
    db.query(FragmentTag).filter(
        FragmentTag.user_id == user_id,
        FragmentTag.fragment_id == fragment_id,
    ).delete(synchronize_session=False)

    for tag in normalize_tags(tags):
        db.add(
            FragmentTag(
                user_id=user_id,
                fragment_id=fragment_id,
                tag=tag,
            )
        )
