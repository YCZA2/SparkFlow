"""
口播稿路由模块

提供 AI 口播稿生成、列表、详情等 API 端点
"""

import json
import logging
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from core import success_response
from core.auth import get_current_user
from core.exceptions import NotFoundError, ValidationError
from models import Fragment, Script
from models.database import get_db
from services.factory import get_llm_service

# 配置日志记录器
logger = logging.getLogger(__name__)


# ========== Pydantic 请求/响应模型 ==========

class ScriptGenerateRequest(BaseModel):
    """口播稿生成请求模型"""
    fragment_ids: List[str] = Field(..., description="选中的碎片 ID 列表", min_length=1, max_length=20)
    mode: str = Field(..., description="生成模式：mode_a (导师爆款) 或 mode_b (专属二脑)")

    class Config:
        json_schema_extra = {
            "example": {
                "fragment_ids": ["fragment-uuid-1", "fragment-uuid-2", "fragment-uuid-3"],
                "mode": "mode_a"
            }
        }


class ScriptItem(BaseModel):
    """口播稿列表项响应模型"""
    id: str
    title: Optional[str]
    mode: str
    status: str
    is_daily_push: bool
    created_at: str


class ScriptDetail(ScriptItem):
    """口播稿详情响应模型"""
    content: Optional[str]
    source_fragment_ids: Optional[str]


# ========== 路由定义 ==========

router = APIRouter(
    prefix="/api/scripts",
    tags=["scripts"],
    responses={401: {"description": "未认证"}},
)


# ========== Prompt 模板路径 ==========

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"
MODE_A_PROMPT_FILE = PROMPTS_DIR / "mode_a_boom.txt"
MODE_B_PROMPT_FILE = PROMPTS_DIR / "mode_b_brain.txt"


def load_prompt_template(mode: str) -> str:
    """
    加载指定模式的 Prompt 模板。

    参数:
        mode: 'mode_a' 或 'mode_b'

    返回:
        Prompt 模板文本

    抛出:
        ValidationError: 如果模式无效或文件不存在
    """
    if mode == "mode_a":
        prompt_file = MODE_A_PROMPT_FILE
    elif mode == "mode_b":
        prompt_file = MODE_B_PROMPT_FILE
    else:
        raise ValidationError(
            message=f"无效的生成模式: {mode}",
            field_errors={"mode": "必须是 'mode_a' 或 'mode_b'"}
        )

    if not prompt_file.exists():
        raise ValidationError(
            message=f"Prompt 模板文件不存在: {prompt_file}",
            field_errors={"mode": "服务端配置错误"}
        )

    return prompt_file.read_text(encoding="utf-8")


@router.post("/generate", status_code=status.HTTP_201_CREATED)
async def generate_script(
    data: ScriptGenerateRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    生成 AI 口播稿

    根据选中的碎片内容和生成模式，调用 LLM 生成口播稿。

    流程:
    1. 根据 fragment_ids 查询碎片的 transcript
    2. 拼接碎片文本
    3. 根据 mode 读取对应 Prompt 模板
    4. 调用 LLM 生成口播稿
    5. 写入 scripts 表
    """
    logger.info(f"[Script] 开始生成口播稿, mode={data.mode}, fragments={len(data.fragment_ids)}")

    # 1. 校验模式参数
    valid_modes = ["mode_a", "mode_b"]
    if data.mode not in valid_modes:
        raise ValidationError(
            message=f"无效的生成模式: {data.mode}",
            field_errors={"mode": f"必须是以下之一: {', '.join(valid_modes)}"}
        )

    # 2. 查询碎片内容
    fragments = (
        db.query(Fragment)
        .filter(
            Fragment.id.in_(data.fragment_ids),
            Fragment.user_id == current_user["user_id"],
        )
        .all()
    )

    # 校验是否所有碎片都存在且属于当前用户
    found_ids = {f.id for f in fragments}
    missing_ids = set(data.fragment_ids) - found_ids
    if missing_ids:
        raise NotFoundError(
            message=f"部分碎片不存在或无权访问: {', '.join(missing_ids)}",
            resource_type="fragment",
            resource_id=",".join(missing_ids)
        )

    # 3. 拼接碎片文本
    fragments_text_parts = []
    for f in fragments:
        if f.transcript:
            fragments_text_parts.append(f.transcript)

    if not fragments_text_parts:
        raise ValidationError(
            message="选中的碎片均无转写内容，无法生成口播稿",
            field_errors={"fragment_ids": "碎片内容为空"}
        )

    fragments_text = "\n\n---\n\n".join(fragments_text_parts)
    logger.info(f"[Script] 拼接后的文本长度: {len(fragments_text)}")

    # 4. 加载 Prompt 模板
    prompt_template = load_prompt_template(data.mode)

    # 替换模板中的占位符
    system_prompt = prompt_template.replace("{fragments_text}", fragments_text)

    # 5. 调用 LLM 生成口播稿
    try:
        llm_service = get_llm_service()
        content = await llm_service.generate(
            system_prompt=system_prompt,
            user_message="",  # Prompt 模板已包含所有内容
            temperature=0.7,
            max_tokens=1500,  # 约 500 字中文
        )
        logger.info(f"[Script] LLM 生成完成, 内容长度: {len(content)}")

    except Exception as e:
        logger.error(f"[Script] LLM 调用失败: {str(e)}")
        raise ValidationError(
            message=f"AI 生成失败: {str(e)}",
            field_errors={"llm": str(e)}
        )

    # 6. 写入数据库
    script = Script(
        user_id=current_user["user_id"],
        title=None,  # 可以后续让用户编辑
        content=content,
        mode=data.mode,
        source_fragment_ids=json.dumps(data.fragment_ids, ensure_ascii=False),
        status="draft",
        is_daily_push=False,
    )

    db.add(script)
    db.commit()
    db.refresh(script)

    logger.info(f"[Script] 口播稿创建成功, id={script.id}")

    return success_response(
        data={
            "id": script.id,
            "title": script.title,
            "content": script.content,
            "mode": script.mode,
            "source_fragment_ids": script.source_fragment_ids,
            "status": script.status,
            "is_daily_push": script.is_daily_push,
            "created_at": script.created_at.isoformat() if script.created_at else None,
        },
        message="口播稿生成成功",
    )


@router.get("/")
async def list_scripts(
    limit: int = Query(20, ge=1, le=100, description="返回数量限制"),
    offset: int = Query(0, ge=0, description="偏移量"),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    获取当前用户的口播稿列表

    返回按创建时间降序排列的口播稿列表
    """
    scripts = (
        db.query(Script)
        .filter(Script.user_id == current_user["user_id"])
        .order_by(Script.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return success_response(
        data={
            "items": [
                {
                    "id": s.id,
                    "title": s.title,
                    "mode": s.mode,
                    "status": s.status,
                    "is_daily_push": s.is_daily_push,
                    "created_at": s.created_at.isoformat() if s.created_at else None,
                }
                for s in scripts
            ],
            "total": len(scripts),
            "limit": limit,
            "offset": offset,
        }
    )


@router.get("/{script_id}")
async def get_script(
    script_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    获取单条口播稿详情
    """
    script = (
        db.query(Script)
        .filter(
            Script.id == script_id,
            Script.user_id == current_user["user_id"],
        )
        .first()
    )

    if not script:
        raise NotFoundError(
            message="口播稿不存在或无权访问",
            resource_type="script",
            resource_id=script_id,
        )

    return success_response(
        data={
            "id": script.id,
            "title": script.title,
            "content": script.content,
            "mode": script.mode,
            "source_fragment_ids": script.source_fragment_ids,
            "status": script.status,
            "is_daily_push": script.is_daily_push,
            "created_at": script.created_at.isoformat() if script.created_at else None,
        }
    )


@router.patch("/{script_id}")
async def update_script(
    script_id: str,
    status: Optional[str] = Query(None, description="更新状态: draft, ready, filmed"),
    title: Optional[str] = Query(None, description="更新标题"),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    更新口播稿状态或标题

    支持更新:
    - status: 口播稿状态 (draft/ready/filmed)
    - title: 口播稿标题
    """
    script = (
        db.query(Script)
        .filter(
            Script.id == script_id,
            Script.user_id == current_user["user_id"],
        )
        .first()
    )

    if not script:
        raise NotFoundError(
            message="口播稿不存在或无权访问",
            resource_type="script",
            resource_id=script_id,
        )

    # 更新状态
    if status is not None:
        valid_statuses = ["draft", "ready", "filmed"]
        if status not in valid_statuses:
            raise ValidationError(
                message=f"无效的状态值: {status}",
                field_errors={"status": f"必须是以下之一: {', '.join(valid_statuses)}"}
            )
        script.status = status
        logger.info(f"[Script] 更新状态: {script_id} -> {status}")

    # 更新标题
    if title is not None:
        script.title = title
        logger.info(f"[Script] 更新标题: {script_id} -> {title}")

    db.commit()
    db.refresh(script)

    return success_response(
        data={
            "id": script.id,
            "title": script.title,
            "content": script.content,
            "mode": script.mode,
            "source_fragment_ids": script.source_fragment_ids,
            "status": script.status,
            "is_daily_push": script.is_daily_push,
            "created_at": script.created_at.isoformat() if script.created_at else None,
        },
        message="口播稿更新成功",
    )


@router.delete("/{script_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_script(
    script_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    删除口播稿

    删除成功返回 204 No Content
    """
    script = (
        db.query(Script)
        .filter(
            Script.id == script_id,
            Script.user_id == current_user["user_id"],
        )
        .first()
    )

    if not script:
        raise NotFoundError(
            message="口播稿不存在或无权访问",
            resource_type="script",
            resource_id=script_id,
        )

    db.delete(script)
    db.commit()

    logger.info(f"[Script] 删除口播稿: {script_id}")

    return None