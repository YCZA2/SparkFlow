from __future__ import annotations

import time

from core.logging_config import get_logger
from modules.shared.enrichment import build_fallback_summary_and_tags, generate_summary_and_tags
from modules.shared.fragment_snapshots import FragmentSnapshotReader
from modules.shared.warning_throttle import WarningThrottle

VECTOR_SYNC_WARNING_THROTTLE_SECONDS = 60.0

logger = get_logger(__name__)
_vector_sync_throttle = WarningThrottle(VECTOR_SYNC_WARNING_THROTTLE_SECONDS)
_FRAGMENT_SNAPSHOT_READER = FragmentSnapshotReader()


class FragmentDerivativeService:
    """封装碎片摘要标签与向量同步逻辑。"""

    def __init__(self, *, vector_store, llm_provider) -> None:
        """装配衍生字段计算所需依赖。"""
        self.vector_store = vector_store
        self.llm_provider = llm_provider

    async def backfill_snapshot_derivatives(
        self,
        *,
        db,
        user_id: str,
        fragment_id: str,
        source: str,
        effective_text: str | None = None,
        body_html: str | None = None,
    ) -> tuple[str | None, list[str]]:
        """在无 projection 行时，基于 snapshot 或任务文本补齐摘要标签并同步向量。"""
        from modules.shared.content.content_html import extract_plain_text_from_html

        normalized_text = (effective_text or extract_plain_text_from_html(body_html or "")).strip()
        if not normalized_text:
            self._patch_snapshot_if_possible(
                db=db,
                user_id=user_id,
                fragment_id=fragment_id,
                source=source,
                summary=None,
                tags=[],
            )
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
        self._patch_snapshot_if_possible(
            db=db,
            user_id=user_id,
            fragment_id=fragment_id,
            source=source,
            summary=summary,
            tags=tags,
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

    def _patch_snapshot_if_possible(
        self,
        *,
        db,
        user_id: str,
        fragment_id: str,
        source: str,
        summary: str | None,
        tags: list[str],
    ) -> None:
        """仅在真实 DB session 场景下回写 snapshot，避免单测 stub 误触发。"""
        if not hasattr(db, "query"):
            return
        _FRAGMENT_SNAPSHOT_READER.merge_server_fields(
            db=db,
            user_id=user_id,
            fragment_id=fragment_id,
            source=source,
            server_patch={
                "summary": summary,
                "tags": list(tags),
            },
        )

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
