"""Script domain service."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Optional

from sqlalchemy.orm import Session

from core.exceptions import NotFoundError, ValidationError
from models import Fragment, Script
from services.factory import get_llm_service

from . import repository

logger = logging.getLogger(__name__)

VALID_SCRIPT_MODES = {"mode_a", "mode_b"}
VALID_SCRIPT_STATUSES = {"draft", "ready", "filmed"}

PROMPTS_DIR = Path(__file__).parent.parent.parent / "prompts"
MODE_A_PROMPT_FILE = PROMPTS_DIR / "mode_a_boom.txt"
MODE_B_PROMPT_FILE = PROMPTS_DIR / "mode_b_brain.txt"


def serialize_script(script: Script) -> dict[str, Any]:
    source_fragment_ids: Optional[list[str]] = None
    if script.source_fragment_ids:
        try:
            parsed = json.loads(script.source_fragment_ids)
        except json.JSONDecodeError:
            parsed = None
        if isinstance(parsed, list):
            source_fragment_ids = [str(fragment_id) for fragment_id in parsed if fragment_id]

    return {
        "id": script.id,
        "title": script.title,
        "content": script.content,
        "mode": script.mode,
        "source_fragment_ids": source_fragment_ids,
        "status": script.status,
        "is_daily_push": script.is_daily_push,
        "created_at": script.created_at.isoformat() if script.created_at else None,
    }


def load_prompt_template(mode: str) -> str:
    if mode not in VALID_SCRIPT_MODES:
        raise ValidationError(
            message=f"无效的生成模式: {mode}",
            field_errors={"mode": "必须是 'mode_a' 或 'mode_b'"},
        )

    prompt_file = MODE_A_PROMPT_FILE if mode == "mode_a" else MODE_B_PROMPT_FILE
    if not prompt_file.exists():
        raise ValidationError(
            message=f"Prompt 模板文件不存在: {prompt_file}",
            field_errors={"mode": "服务端配置错误"},
        )

    return prompt_file.read_text(encoding="utf-8")


def _get_fragments_for_user(db: Session, user_id: str, fragment_ids: list[str]) -> list[Fragment]:
    fragments = repository.get_fragments_for_user(db=db, user_id=user_id, fragment_ids=fragment_ids)
    found_ids = {fragment.id for fragment in fragments}
    missing_ids = sorted(set(fragment_ids) - found_ids)
    if missing_ids:
        raise NotFoundError(
            message=f"部分碎片不存在或无权访问: {', '.join(missing_ids)}",
            resource_type="fragment",
            resource_id=",".join(missing_ids),
        )
    return fragments


def _build_fragments_text(fragments: list[Fragment]) -> str:
    parts = [fragment.transcript for fragment in fragments if fragment.transcript]
    if not parts:
        raise ValidationError(
            message="选中的碎片均无转写内容，无法生成口播稿",
            field_errors={"fragment_ids": "碎片内容为空"},
        )
    return "\n\n---\n\n".join(parts)


async def generate_script(db: Session, user_id: str, fragment_ids: list[str], mode: str) -> Script:
    if mode not in VALID_SCRIPT_MODES:
        raise ValidationError(
            message=f"无效的生成模式: {mode}",
            field_errors={"mode": "必须是以下之一: mode_a, mode_b"},
        )

    logger.info("[Script] start generate mode=%s count=%s", mode, len(fragment_ids))
    fragments = _get_fragments_for_user(db=db, user_id=user_id, fragment_ids=fragment_ids)
    fragments_text = _build_fragments_text(fragments)
    prompt_template = load_prompt_template(mode)
    system_prompt = prompt_template.replace("{fragments_text}", fragments_text)

    try:
        llm_service = get_llm_service()
        content = await llm_service.generate(
            system_prompt=system_prompt,
            user_message="",
            temperature=0.7,
            max_tokens=1500,
        )
    except Exception as exc:
        logger.error("[Script] llm generate failed: %s", str(exc))
        raise ValidationError(
            message=f"AI 生成失败: {str(exc)}",
            field_errors={"llm": str(exc)},
        ) from exc

    script = repository.create(
        db=db,
        user_id=user_id,
        content=content,
        mode=mode,
        source_fragment_ids=json.dumps(fragment_ids, ensure_ascii=False),
    )
    logger.info("[Script] created id=%s", script.id)
    return script


def list_scripts(db: Session, user_id: str, limit: int, offset: int) -> list[Script]:
    return repository.list_by_user(db=db, user_id=user_id, limit=limit, offset=offset)


def count_scripts(db: Session, user_id: str) -> int:
    return repository.count_by_user(db=db, user_id=user_id)


def get_script_or_raise(db: Session, user_id: str, script_id: str) -> Script:
    script = repository.get_by_id(db=db, user_id=user_id, script_id=script_id)
    if not script:
        raise NotFoundError(
            message="口播稿不存在或无权访问",
            resource_type="script",
            resource_id=script_id,
        )
    return script


def update_script(
    db: Session,
    user_id: str,
    script_id: str,
    status_value: Optional[str],
    title: Optional[str],
) -> Script:
    script = get_script_or_raise(db=db, user_id=user_id, script_id=script_id)
    if status_value is not None and status_value not in VALID_SCRIPT_STATUSES:
        raise ValidationError(
            message=f"无效的状态值: {status_value}",
            field_errors={"status": "必须是以下之一: draft, ready, filmed"},
        )
    return repository.update(db=db, script=script, status_value=status_value, title=title)


def delete_script(db: Session, user_id: str, script_id: str) -> None:
    script = get_script_or_raise(db=db, user_id=user_id, script_id=script_id)
    repository.delete(db=db, script=script)
