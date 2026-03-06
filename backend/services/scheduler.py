"""Daily aggregation scheduler for phase 13."""

from __future__ import annotations

import logging
from collections import defaultdict
from datetime import datetime, timezone
from math import ceil
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy.orm import Session

from core import settings
from core.exceptions import ValidationError
from domains.fragments import repository as fragment_repository
from domains.scripts import repository as script_repository
from domains.scripts import service as script_service
from models import Fragment, User
from models.database import SessionLocal
from services.vector_service import query_similar_fragments
from utils.time import get_app_timezone, get_local_day_bounds

logger = logging.getLogger(__name__)

_scheduler = AsyncIOScheduler(timezone=get_app_timezone())


def get_scheduler() -> AsyncIOScheduler:
    return _scheduler


def start_scheduler() -> None:
    if _scheduler.get_job("daily-fragment-aggregate") is None:
        _scheduler.add_job(
            _run_daily_aggregate_job,
            trigger="cron",
            id="daily-fragment-aggregate",
            replace_existing=True,
            hour=settings.DAILY_PUSH_HOUR,
            minute=settings.DAILY_PUSH_MINUTE,
        )
    if not _scheduler.running:
        _scheduler.start()
        logger.info(
            "Daily aggregate scheduler started at %02d:%02d (%s)",
            settings.DAILY_PUSH_HOUR,
            settings.DAILY_PUSH_MINUTE,
            settings.APP_TIMEZONE,
        )


def stop_scheduler() -> None:
    if _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Daily aggregate scheduler stopped")


async def _run_daily_aggregate_job() -> None:
    try:
        result = await daily_aggregate()
        logger.info("Daily aggregate completed: %s", result)
    except Exception:
        logger.exception("Daily aggregate job failed")


async def daily_aggregate(
    *,
    reference_time: datetime | None = None,
    db: Session | None = None,
) -> dict[str, Any]:
    own_session = db is None
    session = db or SessionLocal()
    try:
        return await _daily_aggregate_with_session(session, reference_time=reference_time)
    finally:
        if own_session:
            session.close()


async def trigger_daily_push_for_user(
    *,
    db: Session,
    user_id: str,
    reference_time: datetime | None = None,
    force: bool = False,
) -> Any:
    target_time = reference_time or datetime.now(timezone.utc)
    today_start, today_end = get_local_day_bounds(target_time, day_offset=0)
    existing_script = script_repository.get_latest_daily_push_for_window(
        db=db,
        user_id=user_id,
        start_at=today_start,
        end_at=today_end,
    )
    if existing_script:
        return existing_script

    recent_fragments = fragment_repository.list_synced_in_range(
        db=db,
        user_id=user_id,
        start_at=today_start,
        end_at=today_end,
    )
    if len(recent_fragments) < settings.DAILY_PUSH_MIN_FRAGMENTS:
        raise ValidationError(
            message=f"今天至少需要 {settings.DAILY_PUSH_MIN_FRAGMENTS} 条已转写碎片，才能立即生成灵感卡片",
            field_errors={"fragments": "今日碎片数量不足"},
        )

    related_fragments = recent_fragments if force else await _select_related_fragments(
        user_id=user_id,
        fragments=recent_fragments,
    )
    if len(related_fragments) < settings.DAILY_PUSH_MIN_FRAGMENTS:
        raise ValidationError(
            message="今天的碎片主题还不够集中，暂时无法生成灵感卡片",
            field_errors={"fragments": "语义关联不足"},
        )

    local_now = target_time.astimezone(get_app_timezone())
    return await _create_daily_push_script(
        db=db,
        user_id=user_id,
        fragments=related_fragments,
        title=f"{'强制' if force else '即时'}灵感推盘 · {local_now.date().isoformat()}",
    )


async def _daily_aggregate_with_session(
    db: Session,
    *,
    reference_time: datetime | None = None,
) -> dict[str, Any]:
    target_time = reference_time or datetime.now(timezone.utc)
    local_now = target_time.astimezone(get_app_timezone())
    yesterday_start, yesterday_end = get_local_day_bounds(target_time, day_offset=-1)
    today_start, today_end = get_local_day_bounds(target_time, day_offset=0)
    generated_script_ids: list[str] = []
    skipped_users = 0

    user_ids = {
        row[0] for row in db.query(User.id).all()
    }
    user_ids.update(
        row[0]
        for row in db.query(Fragment.user_id).filter(Fragment.user_id.isnot(None)).distinct().all()
    )
    ordered_user_ids = sorted(user_ids)
    for user_id in ordered_user_ids:
        if script_repository.get_latest_daily_push_for_window(
            db=db,
            user_id=user_id,
            start_at=today_start,
            end_at=today_end,
        ):
            skipped_users += 1
            continue

        recent_fragments = fragment_repository.list_synced_in_range(
            db=db,
            user_id=user_id,
            start_at=yesterday_start,
            end_at=yesterday_end,
        )
        if len(recent_fragments) < settings.DAILY_PUSH_MIN_FRAGMENTS:
            skipped_users += 1
            continue

        related_fragments = await _select_related_fragments(user_id=user_id, fragments=recent_fragments)
        if len(related_fragments) < settings.DAILY_PUSH_MIN_FRAGMENTS:
            skipped_users += 1
            continue

        try:
            script = await _create_daily_push_script(
                db=db,
                user_id=user_id,
                title=f"每日灵感推盘 · {local_now.date().isoformat()}",
                fragments=related_fragments,
            )
            generated_script_ids.append(script.id)
        except Exception:
            logger.exception("Failed to generate daily push for user=%s", user_id)
            skipped_users += 1

    return {
        "processed_users": len(ordered_user_ids),
        "generated_scripts": len(generated_script_ids),
        "generated_script_ids": generated_script_ids,
        "skipped_users": skipped_users,
        "window_start": yesterday_start.isoformat(),
        "window_end": yesterday_end.isoformat(),
    }


async def _select_related_fragments(user_id: str, fragments: list[Fragment]) -> list[Fragment]:
    candidate_ids = {fragment.id for fragment in fragments if fragment.transcript}
    if len(candidate_ids) < settings.DAILY_PUSH_MIN_FRAGMENTS:
        return []

    adjacency: dict[str, set[str]] = defaultdict(set)
    top_k = max(5, ceil(len(fragments) * 1.5))
    for fragment in fragments:
        query_text = fragment.transcript or fragment.summary or ""
        if not query_text.strip():
            continue

        try:
            matches = await query_similar_fragments(
                user_id=user_id,
                query_text=query_text,
                top_k=top_k,
                exclude_ids=[fragment.id],
            )
        except Exception:
            logger.warning("Daily aggregate similarity lookup failed for fragment=%s", fragment.id)
            continue

        for match in matches:
            matched_id = match.get("fragment_id")
            score = float(match.get("score") or 0.0)
            if matched_id in candidate_ids and score >= settings.DAILY_PUSH_SIMILARITY_THRESHOLD:
                adjacency[fragment.id].add(matched_id)
                adjacency[matched_id].add(fragment.id)

    largest_component = _largest_connected_component(adjacency=adjacency, fragment_ids=candidate_ids)
    if len(largest_component) < settings.DAILY_PUSH_MIN_FRAGMENTS:
        return []

    fragment_map = {fragment.id: fragment for fragment in fragments}
    selected_fragments = [fragment_map[fragment_id] for fragment_id in largest_component if fragment_id in fragment_map]
    return sorted(selected_fragments, key=lambda fragment: fragment.created_at)


def _largest_connected_component(*, adjacency: dict[str, set[str]], fragment_ids: set[str]) -> list[str]:
    visited: set[str] = set()
    best_component: list[str] = []

    for fragment_id in fragment_ids:
        if fragment_id in visited:
            continue

        stack = [fragment_id]
        component: list[str] = []
        while stack:
            current = stack.pop()
            if current in visited:
                continue
            visited.add(current)
            component.append(current)
            stack.extend(neighbor for neighbor in adjacency.get(current, set()) if neighbor not in visited)

        if len(component) > len(best_component):
            best_component = component

    return best_component


async def _create_daily_push_script(
    *,
    db: Session,
    user_id: str,
    fragments: list[Fragment],
    title: str,
) -> Any:
    fragments_text = script_service.build_fragments_text(fragments)
    content = await script_service.generate_script_content(
        mode="mode_a",
        fragments_text=fragments_text,
    )
    return script_service.create_script_record(
        db=db,
        user_id=user_id,
        content=content,
        mode="mode_a",
        fragment_ids=[fragment.id for fragment in fragments],
        title=title,
        status="ready",
        is_daily_push=True,
    )
