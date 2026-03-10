from __future__ import annotations

from core.exceptions import NotFoundError

from domains.media_assets import repository as media_asset_repository


class FragmentAssetBindingService:
    """封装碎片与媒体素材的绑定关系维护。"""

    def attach_media_assets(
        self,
        *,
        db,
        user_id: str,
        content_type: str,
        content_id: str,
        media_asset_ids: list[str],
    ) -> None:
        """把素材资源挂到指定内容对象。"""
        for media_asset_id in media_asset_ids:
            asset = media_asset_repository.get_by_id(db=db, user_id=user_id, asset_id=media_asset_id)
            if not asset:
                raise NotFoundError(message="媒体资源不存在或无权访问", resource_type="media_asset", resource_id=media_asset_id)
            media_asset_repository.attach_to_content(
                db=db,
                user_id=user_id,
                media_asset_id=media_asset_id,
                content_type=content_type,
                content_id=content_id,
            )

    def replace_media_assets(
        self,
        *,
        db,
        user_id: str,
        content_type: str,
        content_id: str,
        media_asset_ids: list[str],
    ) -> None:
        """重建内容对象上的素材关联列表。"""
        current_assets = media_asset_repository.list_content_assets(
            db=db,
            user_id=user_id,
            content_type=content_type,
            content_id=content_id,
        )
        current_ids = {item.id for item in current_assets}
        target_ids = list(dict.fromkeys(media_asset_ids))
        for media_asset_id in current_ids - set(target_ids):
            media_asset_repository.detach_from_content(
                db=db,
                user_id=user_id,
                content_type=content_type,
                content_id=content_id,
                media_asset_id=media_asset_id,
            )
        self.attach_media_assets(
            db=db,
            user_id=user_id,
            content_type=content_type,
            content_id=content_id,
            media_asset_ids=target_ids,
        )
