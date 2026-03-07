from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from core import success_response
from core.auth import get_current_user
from modules.shared.container import ServiceContainer, get_container, get_db_session

from .application import DailyPushUseCase, ScriptCommandService, ScriptGenerationUseCase, ScriptQueryService, map_script

router = APIRouter(prefix="/api/scripts", tags=["scripts"], responses={401: {"description": "未认证"}})


class ScriptGenerationRequest(BaseModel):
    fragment_ids: list[str] = Field(..., min_length=1, max_length=20)
    mode: str


class ScriptUpdateRequest(BaseModel):
    status: str | None = None
    title: str | None = None


def get_script_generation_use_case(container: ServiceContainer = Depends(get_container)) -> ScriptGenerationUseCase:
    return ScriptGenerationUseCase(llm_provider=container.llm_provider, prompt_loader=container.prompt_loader)


def get_daily_push_use_case(container: ServiceContainer = Depends(get_container)) -> DailyPushUseCase:
    return DailyPushUseCase(
        llm_provider=container.llm_provider,
        prompt_loader=container.prompt_loader,
        vector_store=container.vector_store,
    )


@router.post("/generation", status_code=status.HTTP_201_CREATED)
async def generate_script(
    data: ScriptGenerationRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
    use_case: ScriptGenerationUseCase = Depends(get_script_generation_use_case),
):
    script = await use_case.generate(db=db, user_id=current_user["user_id"], fragment_ids=data.fragment_ids, mode=data.mode)
    return success_response(data=map_script(script), message="口播稿生成成功")


@router.get("")
async def list_scripts(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    return success_response(data=ScriptQueryService().list_scripts(db=db, user_id=current_user["user_id"], limit=limit, offset=offset))


@router.get("/daily-push")
async def get_daily_push(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    return success_response(data=map_script(ScriptQueryService().get_today_daily_push(db=db, user_id=current_user["user_id"])))


@router.post("/daily-push/trigger")
async def trigger_daily_push(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
    use_case: DailyPushUseCase = Depends(get_daily_push_use_case),
):
    script = await use_case.trigger_for_user(db=db, user_id=current_user["user_id"])
    return success_response(data=map_script(script), message="今日灵感卡片已生成")


@router.post("/daily-push/force-trigger")
async def force_trigger_daily_push(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
    use_case: DailyPushUseCase = Depends(get_daily_push_use_case),
):
    script = await use_case.trigger_for_user(db=db, user_id=current_user["user_id"], force=True)
    return success_response(data=map_script(script), message="已强制生成今日灵感卡片")


@router.get("/{script_id}")
async def get_script(
    script_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    return success_response(data=map_script(ScriptQueryService().get_script(db=db, user_id=current_user["user_id"], script_id=script_id)))


@router.patch("/{script_id}")
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
    )
    return success_response(data=map_script(script), message="口播稿更新成功")


@router.delete("/{script_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_script(
    script_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    ScriptCommandService().delete_script(db=db, user_id=current_user["user_id"], script_id=script_id)
    return None
