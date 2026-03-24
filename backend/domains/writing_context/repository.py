"""脚本写作上下文聚合数据访问。"""

from __future__ import annotations

from sqlalchemy.orm import Session

from models import MethodologyEntry, StableCoreProfile


def get_stable_core_profile(db: Session, *, user_id: str) -> StableCoreProfile | None:
    """读取用户的稳定内核画像。"""
    return (
        db.query(StableCoreProfile)
        .filter(StableCoreProfile.user_id == user_id)
        .first()
    )


def upsert_stable_core_profile(
    db: Session,
    *,
    user_id: str,
    content: str,
    source_summary: str | None,
    source_signature: str | None,
) -> StableCoreProfile:
    """创建或更新用户的稳定内核画像。"""
    profile = get_stable_core_profile(db=db, user_id=user_id)
    if profile is None:
        profile = StableCoreProfile(
            user_id=user_id,
            content=content,
            source_summary=source_summary,
            source_signature=source_signature,
        )
        db.add(profile)
    else:
        profile.content = content
        profile.source_summary = source_summary
        profile.source_signature = source_signature
    db.commit()
    db.refresh(profile)
    return profile


def list_enabled_methodology_entries(db: Session, *, user_id: str) -> list[MethodologyEntry]:
    """读取当前启用的方法论条目。"""
    return (
        db.query(MethodologyEntry)
        .filter(MethodologyEntry.user_id == user_id, MethodologyEntry.enabled.is_(True))
        .order_by(MethodologyEntry.updated_at.desc(), MethodologyEntry.created_at.desc())
        .all()
    )


def list_methodology_entries_by_source_type(
    db: Session,
    *,
    user_id: str,
    source_type: str,
) -> list[MethodologyEntry]:
    """按来源类型读取方法论条目。"""
    return (
        db.query(MethodologyEntry)
        .filter(MethodologyEntry.user_id == user_id, MethodologyEntry.source_type == source_type)
        .order_by(MethodologyEntry.updated_at.desc(), MethodologyEntry.created_at.desc())
        .all()
    )


def replace_methodology_entries_for_source(
    db: Session,
    *,
    user_id: str,
    source_type: str,
    entries: list[dict[str, str | bool | None]],
) -> list[MethodologyEntry]:
    """替换某一来源的方法论条目集合。"""
    db.query(MethodologyEntry).filter(
        MethodologyEntry.user_id == user_id,
        MethodologyEntry.source_type == source_type,
    ).delete()
    created: list[MethodologyEntry] = []
    for payload in entries:
        entry = MethodologyEntry(
            user_id=user_id,
            title=str(payload.get("title") or "").strip() or None,
            content=str(payload.get("content") or "").strip(),
            source_type=source_type,
            source_ref_ids=payload.get("source_ref_ids"),
            source_signature=payload.get("source_signature"),
            enabled=bool(payload.get("enabled", True)),
        )
        db.add(entry)
        created.append(entry)
    db.commit()
    for entry in created:
        db.refresh(entry)
    return created
