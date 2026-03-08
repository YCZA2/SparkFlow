from __future__ import annotations

from fastapi import APIRouter, Depends

from core import ResponseModel, success_response
from core.auth import get_current_user

from .application import MobileDebugLogService
from .schemas import MobileDebugLogCreateRequest, MobileDebugLogFileStatus, MobileDebugLogItem

router = APIRouter(prefix="/api/debug/mobile-logs", tags=["debug-logs"], responses={401: {"description": "未认证"}})


@router.post(
    "",
    response_model=ResponseModel[MobileDebugLogFileStatus],
    summary="写入移动端错误日志",
    description="接收移动端上传的错误日志，并将其追加写入后端本地日志文件，便于联调排查。",
)
async def append_mobile_debug_log(
    data: MobileDebugLogCreateRequest,
    current_user: dict = Depends(get_current_user),
):
    payload = MobileDebugLogItem(
        timestamp=data.timestamp,
        level=data.level,
        source=data.source,
        message=data.message,
        context=data.context,
        user_id=current_user["user_id"],
    )
    result = MobileDebugLogService().append(user_id=current_user["user_id"], payload=payload)
    return success_response(data=result, message="移动端日志写入成功")
