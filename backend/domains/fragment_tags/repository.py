"""Data access helpers for normalized fragment tags."""

from __future__ import annotations

import json
from typing import Iterable

from sqlalchemy import case, func
from sqlalchemy.orm import Session

from models import Fragment, FragmentTag


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


def list_tag_stats(
    db: Session,
    *,
    user_id: str,
    query_text: str | None = None,
    limit: int = 20,
) -> list[dict[str, int | str]]:
    normalized_query = str(query_text or "").strip()
    tag_count = func.count(func.distinct(FragmentTag.fragment_id)).label("fragment_count")

    query = (
        db.query(
            FragmentTag.tag.label("tag"),
            tag_count,
        )
        .join(
            Fragment,
            (Fragment.id == FragmentTag.fragment_id) & (Fragment.user_id == FragmentTag.user_id),
        )
        .filter(FragmentTag.user_id == user_id)
        .group_by(FragmentTag.tag)
    )

    if normalized_query:
        lowered_tag = func.lower(FragmentTag.tag)
        lowered_query = normalized_query.lower()
        prefix_pattern = f"{lowered_query}%"
        contains_pattern = f"%{lowered_query}%"
        match_rank = case(
            (lowered_tag.like(prefix_pattern), 0),
            (lowered_tag.like(contains_pattern), 1),
            else_=2,
        )
        query = (
            query
            .filter(lowered_tag.like(contains_pattern))
            .order_by(match_rank.asc(), tag_count.desc(), FragmentTag.tag.asc())
        )
    else:
        query = query.order_by(tag_count.desc(), FragmentTag.tag.asc())

    rows = query.limit(limit).all()
    return [
        {
            "tag": str(tag),
            "fragment_count": int(fragment_count or 0),
        }
        for tag, fragment_count in rows
    ]
