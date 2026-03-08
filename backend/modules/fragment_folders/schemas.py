from __future__ import annotations

from pydantic import BaseModel, Field


class FragmentFolderMutationRequest(BaseModel):
    name: str = Field(..., description="文件夹名称")


class FragmentFolderItem(BaseModel):
    id: str
    name: str
    fragment_count: int
    created_at: str | None = None
    updated_at: str | None = None


class FragmentFolderListResponse(BaseModel):
    items: list[FragmentFolderItem]
    total: int
