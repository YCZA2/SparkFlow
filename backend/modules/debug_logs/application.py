from __future__ import annotations

import json
from pathlib import Path

from .schemas import MobileDebugLogFileStatus, MobileDebugLogItem

LOG_FILE_PATH = Path(__file__).resolve().parents[2] / "runtime_logs" / "mobile-debug.log"


class MobileDebugLogService:
    def append(self, *, user_id: str, payload: MobileDebugLogItem) -> MobileDebugLogFileStatus:
        LOG_FILE_PATH.parent.mkdir(parents=True, exist_ok=True)
        record = {
            "timestamp": payload.timestamp,
            "level": payload.level,
            "source": payload.source,
            "message": payload.message,
            "context": payload.context,
            "user_id": user_id,
        }
        with LOG_FILE_PATH.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
        return MobileDebugLogFileStatus(path=str(LOG_FILE_PATH), appended=True)
