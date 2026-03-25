from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from modules.shared.fragment_snapshots import (
    FragmentSnapshot,
    FragmentSnapshotReader,
    serialize_fragment_snapshot,
)

DailyPushFragmentSnapshot = FragmentSnapshot


class DailyPushSnapshotReader:
    """对共享 fragment snapshot reader 的每日推盘适配包装。"""

    def __init__(self) -> None:
        """装配每日推盘复用的共享快照读取器。"""
        self.reader = FragmentSnapshotReader()

    def list_fragment_snapshots(
        self,
        *,
        db: Session,
        user_id: str,
        start_at,
        end_at,
    ) -> list[DailyPushFragmentSnapshot]:
        """读取目标时间窗内可用于推盘的 fragment 快照。"""
        return self.reader.list_by_time_window(
            db=db,
            user_id=user_id,
            start_at=start_at,
            end_at=end_at,
        )

    def list_recent_fragment_snapshots(
        self,
        *,
        db: Session,
        user_id: str,
        limit: int,
    ) -> list[DailyPushFragmentSnapshot]:
        """读取最近可用的 fragment 快照，供手动触发兜底。"""
        snapshots = self.reader.list_vectorizable_by_user(db=db, user_id=user_id)
        return snapshots[-limit:]

    def list_user_ids(self, *, db: Session) -> list[str]:
        """枚举存在有效 fragment snapshot 的用户集合。"""
        return self.reader.list_user_ids(db=db)

    @staticmethod
    def serialize_snapshots(snapshots: list[DailyPushFragmentSnapshot]) -> list[dict[str, Any]]:
        """把快照 DTO 转成可写入 pipeline 输入的纯字典。"""
        return [serialize_fragment_snapshot(snapshot) for snapshot in snapshots]
