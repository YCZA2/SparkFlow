from __future__ import annotations

import json
import time

from core.logging_config import get_logger
from domains.fragment_tags import repository as fragment_tag_repository
from modules.shared.enrichment import build_fallback_summary_and_tags, generate_summary_and_tags
from modules.shared.warning_throttle import WarningThrottle
from utils.serialization import parse_json_list

SUMMARY_REFRESH_MIN_ABS_DELTA = 50
SUMMARY_REFRESH_MIN_RATIO = 0.2
VECTOR_SYNC_WARNING_THROTTLE_SECONDS = 60.0

logger = get_logger(__name__)
_vector_sync_throttle = WarningThrottle(VECTOR_SYNC_WARNING_THROTTLE_SECONDS)


class FragmentDerivativeService:
    """封装碎片摘要标签与向量同步逻辑。"""

    def __init__(self, *, vector_store, llm_provider) -> None:
        """装配衍生字段计算所需依赖。"""
        self.vector_store = vector_store
        self.llm_provider = llm_provider

    async def refresh_fragment_derivatives(
        self,
        *,
        db,
        user_id: str,
        fragment,
        previous_effective_text: str,
        current_effective_text: str,
    ) -> None:
        """在正文更新后同步刷新摘要标签与向量。"""
        if not current_effective_text:
            await self._sync_fragment_vector_by_fields(
                action="delete",
                user_id=user_id,
                fragment_id=fragment.id,
                source=fragment.source,
            )
        if not self.should_refresh_enrichment(
            previous_effective_text=previous_effective_text,
            current_effective_text=current_effective_text,
        ):
            if current_effective_text:
                await self._sync_fragment_vector_by_fields(
                    action="upsert",
                    user_id=user_id,
                    fragment_id=fragment.id,
                    source=fragment.source,
                    text=current_effective_text,
                    summary=fragment.summary,
                    tags=parse_json_list(fragment.tags, allow_csv_fallback=True),
                )
            return

        await self.backfill_fragment_derivatives(
            db=db,
            user_id=user_id,
            fragment=fragment,
            effective_text=current_effective_text,
        )

    async def backfill_fragment_derivatives(
        self,
        *,
        db,
        user_id: str,
        fragment,
        effective_text: str | None = None,
    ) -> tuple[str | None, list[str]]:
        """基于当前 fragment 内容补齐摘要、标签，并最佳努力同步向量。"""
        from modules.fragments.content import read_fragment_body_html, read_fragment_plain_text

        normalized_text = (effective_text or read_fragment_plain_text(fragment) or fragment.transcript or "").strip()
        if not normalized_text:
            fragment.summary = None
            fragment.tags = None
            fragment_tag_repository.replace_for_fragment(
                db=db,
                user_id=user_id,
                fragment_id=fragment.id,
                tags=[],
            )
            db.commit()
            await self._sync_fragment_vector_by_fields(
                action="delete",
                user_id=user_id,
                fragment_id=fragment.id,
                source=fragment.source,
            )
            return (None, [])

        body_html = read_fragment_body_html(fragment)
        summary, tags = await self.generate_fragment_enrichment(
            normalized_text,
            body_html=body_html,
        )
        fragment.summary = summary
        fragment.tags = self.serialize_tags(tags)
        fragment_tag_repository.replace_for_fragment(
            db=db,
            user_id=user_id,
            fragment_id=fragment.id,
            tags=tags,
        )
        db.commit()
        await self._sync_fragment_vector_by_fields(
            action="upsert",
            user_id=user_id,
            fragment_id=fragment.id,
            source=fragment.source,
            text=normalized_text,
            summary=summary,
            tags=tags,
        )
        return (summary, tags)

    async def backfill_snapshot_derivatives(
        self,
        *,
        user_id: str,
        fragment_id: str,
        source: str,
        effective_text: str | None = None,
        body_html: str | None = None,
    ) -> tuple[str | None, list[str]]:
        """在无 projection 行时，基于 snapshot 或 pipeline 文本补齐摘要标签并同步向量。"""
        from modules.shared.content.content_html import extract_plain_text_from_html

        normalized_text = (effective_text or extract_plain_text_from_html(body_html or "")).strip()
        if not normalized_text:
            await self._sync_fragment_vector_by_fields(
                action="delete",
                user_id=user_id,
                fragment_id=fragment_id,
                source=source,
            )
            return (None, [])

        summary, tags = await self.generate_fragment_enrichment(
            normalized_text,
            body_html=body_html,
        )
        await self._sync_fragment_vector_by_fields(
            action="upsert",
            user_id=user_id,
            fragment_id=fragment_id,
            source=source,
            text=normalized_text,
            summary=summary,
            tags=tags,
        )
        return (summary, tags)

    async def _sync_fragment_vector_by_fields(
        self,
        *,
        action: str,
        user_id: str,
        fragment_id: str,
        source: str,
        text: str | None = None,
        summary: str | None = None,
        tags: list[str] | None = None,
    ) -> None:
        """执行向量同步，并在外部 embedding/向量库故障时降级为仅记录日志。"""
        try:
            if action == "delete":
                await self.vector_store.delete_fragment(user_id=user_id, fragment_id=fragment_id)
                return
            await self.vector_store.upsert_fragment(
                user_id=user_id,
                fragment_id=fragment_id,
                text=text or "",
                source=source,
                summary=summary,
                tags=tags,
            )
        except Exception as exc:
            error_type = type(exc).__name__
            error_message = str(exc)
            current = time.monotonic()
            key = (fragment_id, action, error_type, error_message)
            if _vector_sync_throttle.should_emit(key, now=current):
                logger.warning(
                    "fragment_vector_sync_failed",
                    fragment_id=fragment_id,
                    user_id=user_id,
                    action=action,
                    error_type=error_type,
                    error=error_message,
                )
                return
            logger.debug(
                "fragment_vector_sync_failed_suppressed",
                fragment_id=fragment_id,
                user_id=user_id,
                action=action,
                error_type=error_type,
                error=error_message,
            )

    @staticmethod
    def should_refresh_enrichment(*, previous_effective_text: str, current_effective_text: str) -> bool:
        """根据改动量决定是否重算摘要与标签。"""
        if not current_effective_text.strip():
            return True
        previous_length = len(previous_effective_text.strip())
        current_length = len(current_effective_text.strip())
        if previous_length == 0:
            return True
        absolute_delta = abs(current_length - previous_length)
        ratio_delta = absolute_delta / max(previous_length, 1)
        return absolute_delta >= SUMMARY_REFRESH_MIN_ABS_DELTA or ratio_delta >= SUMMARY_REFRESH_MIN_RATIO

    async def generate_fragment_enrichment(
        self,
        effective_text: str,
        body_html: str | None = None,
    ) -> tuple[str | None, list[str]]:
        """基于正文生成或清空摘要与标签。"""
        normalized_text = effective_text.strip()
        if not normalized_text:
            return (None, [])
        try:
            return await generate_summary_and_tags(
                normalized_text,
                llm_provider=self.llm_provider,
                timeout_seconds=45.0,
                body_html=body_html,
            )
        except Exception:
            logger.warning("summary_and_tags_generation_failed", exc_info=True)
            return build_fallback_summary_and_tags(normalized_text)

    @staticmethod
    def serialize_tags(tags: list[str]) -> str | None:
        """把标签列表转换为稳定 JSON 字符串。"""
        normalized_tags = [tag.strip() for tag in tags if tag and tag.strip()]
        if not normalized_tags:
            return None
        return json.dumps(normalized_tags, ensure_ascii=False)
