from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from core import ResponseModel, success_response
from core.auth import get_current_user
from modules.shared.infrastructure.container import ServiceContainer, get_container, get_db_session

from .application import DailyPushUseCase, RagScriptGenerationUseCase, ScriptCommandService, ScriptQueryService, map_script
from .daily_push_task import build_daily_push_task_service
from .rag_task import build_rag_script_task_service
from .schemas import ScriptDetail, ScriptGenerationRequest, ScriptGenerationResponse, ScriptListResponse, ScriptUpdateRequest

router = APIRouter(prefix="/api/scripts", tags=["scripts"], responses={401: {"description": "未认证"}})


def get_rag_script_generation_use_case(container: ServiceContainer = Depends(get_container)) -> RagScriptGenerationUseCase:
    """构建 RAG 脚本生成用例。"""
    return RagScriptGenerationUseCase(
        task_service=build_rag_script_task_service(container),
    )


def get_daily_push_use_case(container: ServiceContainer = Depends(get_container)) -> DailyPushUseCase:
    """构建每日推盘用例。"""
    return DailyPushUseCase(
        task_service=build_daily_push_task_service(container),
    )


@router.post(
    "/generation",
    status_code=status.HTTP_201_CREATED,
    response_model=ResponseModel[ScriptGenerationResponse],
    summary="生成口播稿",
    description="基于主题和可选碎片，通过 RAG 参考脚本和 SOP 大纲创建异步脚本生成任务。",
)
async def generate_script(
    data: ScriptGenerationRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
    use_case: RagScriptGenerationUseCase = Depends(get_rag_script_generation_use_case),
):
    payload = await use_case.generate_async(
        db=db,
        user_id=current_user["user_id"],
        topic=data.topic,
        fragment_ids=data.fragment_ids,
    )
    return success_response(data=payload, message="口播稿生成任务已创建")


@router.get(
    "",
    response_model=ResponseModel[ScriptListResponse],
    summary="获取口播稿列表",
    description="按分页返回当前用户的口播稿列表。",
)
async def list_scripts(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    return success_response(data=ScriptQueryService().list_scripts(db=db, user_id=current_user["user_id"], limit=limit, offset=offset))


@router.get(
    "/daily-push",
    response_model=ResponseModel[ScriptDetail],
    summary="获取今日推盘稿",
    description="返回今天生成的每日灵感推盘稿，如果当天尚未生成则返回未找到错误。",
)
async def get_daily_push(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    return success_response(data=map_script(ScriptQueryService().get_today_daily_push(db=db, user_id=current_user["user_id"])))


@router.post(
    "/daily-push/trigger",
    response_model=ResponseModel[ScriptGenerationResponse],
    summary="立即补跑今日推盘",
    description="调试或运维场景下，基于当前已备份到服务端的 fragment 快照创建一条异步每日推盘任务。",
)
async def trigger_daily_push(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
    use_case: DailyPushUseCase = Depends(get_daily_push_use_case),
):
    payload = await use_case.trigger_for_user(db=db, user_id=current_user["user_id"])
    return success_response(data=payload, message="今日灵感卡片任务已创建")


@router.post(
    "/daily-push/force-trigger",
    response_model=ResponseModel[ScriptGenerationResponse],
    summary="强制补跑今日推盘",
    description="调试或运维场景下忽略语义聚合约束，基于当前已备份到服务端的 fragment 快照创建一条异步每日推盘任务。",
)
async def force_trigger_daily_push(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
    use_case: DailyPushUseCase = Depends(get_daily_push_use_case),
):
    payload = await use_case.trigger_for_user(db=db, user_id=current_user["user_id"], force=True)
    return success_response(data=payload, message="已创建强制每日推盘任务")


@router.get(
    "/{script_id}",
    response_model=ResponseModel[ScriptDetail],
    summary="获取口播稿详情",
    description="根据口播稿 ID 返回单篇稿件的完整内容和来源碎片信息。",
)
async def get_script(
    script_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    return success_response(data=map_script(ScriptQueryService().get_script(db=db, user_id=current_user["user_id"], script_id=script_id)))


@router.patch(
    "/{script_id}",
    response_model=ResponseModel[ScriptDetail],
    summary="更新口播稿",
    description="更新口播稿标题、HTML 正文或状态，状态仅支持 draft、ready、filmed。",
)
async def update_script(
    script_id: str,
    data: ScriptUpdateRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    script = ScriptCommandService().update_script(
        db=db,
        user_id=current_user["user_id"],
        script_id=script_id,
        status_value=data.status,
        title=data.title,
        body_html=data.body_html,
    )
    return success_response(data=map_script(script), message="口播稿更新成功")


@router.delete(
    "/{script_id}",
    response_model=ResponseModel[None],
    summary="删除口播稿",
    description="删除指定的口播稿记录。",
)
async def delete_script(
    script_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    ScriptCommandService().delete_script(db=db, user_id=current_user["user_id"], script_id=script_id)
    return success_response(data=None, message="口播稿删除成功")
