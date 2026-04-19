# 数据库 Schema 清单

- Alembic 版本：`2c819bf69513`
- `search_path`：`public`
- 当前 schema：`public`

## `alembic_version`

| 字段 | 类型 | 可为空 |
| --- | --- | --- |
| `version_num` | `VARCHAR(32)` | `否` |

索引：
- 无

唯一约束：
- 无

外键：
- 无

## `backup_records`

| 字段 | 类型 | 可为空 |
| --- | --- | --- |
| `id` | `VARCHAR` | `否` |
| `user_id` | `VARCHAR` | `否` |
| `entity_type` | `VARCHAR` | `否` |
| `entity_id` | `VARCHAR` | `否` |
| `entity_version` | `INTEGER` | `否` |
| `operation` | `VARCHAR` | `否` |
| `payload_json` | `TEXT` | `是` |
| `modified_at` | `TIMESTAMP` | `是` |
| `last_modified_device_id` | `VARCHAR` | `是` |
| `created_at` | `TIMESTAMP` | `否` |
| `updated_at` | `TIMESTAMP` | `否` |

索引：
- `ix_backup_records_user_id_entity_type`：`user_id`、`entity_type`（普通索引）
- `ix_backup_records_user_id_updated_at`：`user_id`、`updated_at`（普通索引）
- `uq_backup_records_user_entity`：`user_id`、`entity_type`、`entity_id`（唯一索引）

唯一约束：
- `uq_backup_records_user_entity`：`user_id`、`entity_type`、`entity_id`

外键：
- `backup_records_user_id_fkey`：`user_id` -> `users.id`

## `backup_restore_sessions`

| 字段 | 类型 | 可为空 |
| --- | --- | --- |
| `id` | `VARCHAR` | `否` |
| `user_id` | `VARCHAR` | `否` |
| `device_id` | `VARCHAR` | `是` |
| `reason` | `VARCHAR` | `是` |
| `snapshot_generated_at` | `TIMESTAMP` | `否` |
| `created_at` | `TIMESTAMP` | `否` |

索引：
- `ix_backup_restore_sessions_user_id_created_at`：`user_id`、`created_at`（普通索引）

唯一约束：
- 无

外键：
- `backup_restore_sessions_user_id_fkey`：`user_id` -> `users.id`

## `content_media_links`

| 字段 | 类型 | 可为空 |
| --- | --- | --- |
| `id` | `VARCHAR` | `否` |
| `user_id` | `VARCHAR` | `否` |
| `media_asset_id` | `VARCHAR` | `否` |
| `content_type` | `VARCHAR` | `否` |
| `content_id` | `VARCHAR` | `否` |
| `role` | `VARCHAR` | `否` |
| `created_at` | `TIMESTAMP` | `否` |

索引：
- `ix_content_media_links_content_type_content_id`：`content_type`、`content_id`（普通索引）
- `uq_content_media_links_asset_content_role`：`media_asset_id`、`content_type`、`content_id`、`role`（唯一索引）

唯一约束：
- `uq_content_media_links_asset_content_role`：`media_asset_id`、`content_type`、`content_id`、`role`

外键：
- `content_media_links_media_asset_id_fkey`：`media_asset_id` -> `media_assets.id`
- `content_media_links_user_id_fkey`：`user_id` -> `users.id`

## `device_sessions`

| 字段 | 类型 | 可为空 |
| --- | --- | --- |
| `id` | `VARCHAR` | `否` |
| `user_id` | `VARCHAR` | `否` |
| `device_id` | `VARCHAR` | `否` |
| `session_version` | `INTEGER` | `否` |
| `status` | `VARCHAR` | `否` |
| `created_at` | `TIMESTAMP` | `否` |
| `updated_at` | `TIMESTAMP` | `否` |
| `last_seen_at` | `TIMESTAMP` | `否` |
| `revoked_at` | `TIMESTAMP` | `是` |

索引：
- `ix_device_sessions_user_id_status`：`user_id`、`status`（普通索引）
- `uq_device_sessions_user_device`：`user_id`、`device_id`（唯一索引）

唯一约束：
- `uq_device_sessions_user_device`：`user_id`、`device_id`

外键：
- `device_sessions_user_id_fkey`：`user_id` -> `users.id`

## `fragment_folders`

| 字段 | 类型 | 可为空 |
| --- | --- | --- |
| `id` | `VARCHAR` | `否` |
| `user_id` | `VARCHAR` | `否` |
| `name` | `VARCHAR(50)` | `否` |
| `created_at` | `TIMESTAMP` | `否` |
| `updated_at` | `TIMESTAMP` | `否` |

索引：
- `uq_fragment_folders_user_name`：`user_id`、`name`（唯一索引）

唯一约束：
- `uq_fragment_folders_user_name`：`user_id`、`name`

外键：
- `fragment_folders_user_id_fkey`：`user_id` -> `users.id`

## `knowledge_docs`

| 字段 | 类型 | 可为空 |
| --- | --- | --- |
| `id` | `VARCHAR` | `否` |
| `user_id` | `VARCHAR` | `否` |
| `title` | `VARCHAR` | `否` |
| `content` | `TEXT` | `否` |
| `body_markdown` | `TEXT` | `否` |
| `doc_type` | `VARCHAR` | `否` |
| `vector_ref_id` | `VARCHAR` | `是` |
| `style_description` | `TEXT` | `是` |
| `processing_status` | `VARCHAR` | `否` |
| `source_type` | `VARCHAR` | `否` |
| `source_filename` | `VARCHAR` | `是` |
| `source_mime_type` | `VARCHAR` | `是` |
| `chunk_count` | `INTEGER` | `否` |
| `processing_error` | `TEXT` | `是` |
| `created_at` | `TIMESTAMP` | `否` |
| `updated_at` | `TIMESTAMP` | `否` |

索引：
- 无

唯一约束：
- 无

外键：
- `knowledge_docs_user_id_fkey`：`user_id` -> `users.id`

## `media_assets`

| 字段 | 类型 | 可为空 |
| --- | --- | --- |
| `id` | `VARCHAR` | `否` |
| `user_id` | `VARCHAR` | `否` |
| `media_kind` | `VARCHAR` | `否` |
| `original_filename` | `VARCHAR` | `否` |
| `mime_type` | `VARCHAR` | `否` |
| `storage_provider` | `VARCHAR` | `否` |
| `bucket` | `VARCHAR` | `否` |
| `object_key` | `VARCHAR` | `否` |
| `access_level` | `VARCHAR` | `否` |
| `file_size` | `INTEGER` | `否` |
| `checksum` | `VARCHAR` | `是` |
| `width` | `INTEGER` | `是` |
| `height` | `INTEGER` | `是` |
| `duration_ms` | `INTEGER` | `是` |
| `status` | `VARCHAR` | `否` |
| `created_at` | `TIMESTAMP` | `否` |

索引：
- `ix_media_assets_user_id_created_at`：`user_id`、`created_at`（普通索引）
- `ix_media_assets_user_id_media_kind`：`user_id`、`media_kind`（普通索引）

唯一约束：
- 无

外键：
- `media_assets_user_id_fkey`：`user_id` -> `users.id`

## `methodology_entries`

| 字段 | 类型 | 可为空 |
| --- | --- | --- |
| `id` | `VARCHAR` | `否` |
| `user_id` | `VARCHAR` | `否` |
| `title` | `VARCHAR` | `是` |
| `content` | `TEXT` | `否` |
| `source_type` | `VARCHAR` | `否` |
| `source_ref_ids` | `TEXT` | `是` |
| `source_signature` | `VARCHAR` | `是` |
| `enabled` | `BOOLEAN` | `否` |
| `created_at` | `TIMESTAMP` | `否` |
| `updated_at` | `TIMESTAMP` | `否` |

索引：
- `ix_methodology_entries_user_id_enabled_updated_at`：`user_id`、`enabled`、`updated_at`（普通索引）

唯一约束：
- 无

外键：
- `methodology_entries_user_id_fkey`：`user_id` -> `users.id`

## `task_runs`

| 字段 | 类型 | 可为空 |
| --- | --- | --- |
| `id` | `VARCHAR` | `否` |
| `user_id` | `VARCHAR` | `否` |
| `task_type` | `VARCHAR` | `否` |
| `status` | `VARCHAR` | `否` |
| `input_payload_json` | `TEXT` | `是` |
| `output_payload_json` | `TEXT` | `是` |
| `resource_type` | `VARCHAR` | `是` |
| `resource_id` | `VARCHAR` | `是` |
| `error_message` | `TEXT` | `是` |
| `current_step` | `VARCHAR` | `是` |
| `celery_root_id` | `VARCHAR` | `是` |
| `finished_at` | `TIMESTAMP` | `是` |
| `created_at` | `TIMESTAMP` | `否` |
| `updated_at` | `TIMESTAMP` | `否` |

索引：
- `ix_task_runs_task_type_created_at`：`task_type`、`created_at`（普通索引）
- `ix_task_runs_status_created_at`：`status`、`created_at`（普通索引）
- `ix_task_runs_user_id_created_at`：`user_id`、`created_at`（普通索引）

唯一约束：
- 无

外键：
- `task_runs_user_id_fkey`：`user_id` -> `users.id`

## `task_step_runs`

| 字段 | 类型 | 可为空 |
| --- | --- | --- |
| `id` | `VARCHAR` | `否` |
| `task_run_id` | `VARCHAR` | `否` |
| `step_name` | `VARCHAR` | `否` |
| `step_order` | `INTEGER` | `否` |
| `status` | `VARCHAR` | `否` |
| `attempt_count` | `INTEGER` | `否` |
| `max_attempts` | `INTEGER` | `否` |
| `celery_task_id` | `VARCHAR` | `是` |
| `input_payload_json` | `TEXT` | `是` |
| `output_payload_json` | `TEXT` | `是` |
| `error_message` | `TEXT` | `是` |
| `external_ref_json` | `TEXT` | `是` |
| `started_at` | `TIMESTAMP` | `是` |
| `finished_at` | `TIMESTAMP` | `是` |
| `created_at` | `TIMESTAMP` | `否` |
| `updated_at` | `TIMESTAMP` | `否` |

索引：
- `ix_task_step_runs_task_run_id_step_order`：`task_run_id`、`step_order`（普通索引）
- `ix_task_step_runs_status_started_at`：`status`、`started_at`（普通索引）
- `uq_task_step_runs_run_step`：`task_run_id`、`step_name`（唯一索引）

唯一约束：
- `uq_task_step_runs_run_step`：`task_run_id`、`step_name`

外键：
- `task_step_runs_task_run_id_fkey`：`task_run_id` -> `task_runs.id`

## `scripts`

| 字段 | 类型 | 可为空 |
| --- | --- | --- |
| `id` | `VARCHAR` | `否` |
| `user_id` | `VARCHAR` | `否` |
| `title` | `VARCHAR` | `是` |
| `body_html` | `TEXT` | `否` |
| `mode` | `VARCHAR` | `否` |
| `source_fragment_ids` | `VARCHAR` | `是` |
| `status` | `VARCHAR` | `否` |
| `is_daily_push` | `BOOLEAN` | `否` |
| `created_at` | `TIMESTAMP` | `否` |

索引：
- 无

唯一约束：
- 无

外键：
- `scripts_user_id_fkey`：`user_id` -> `users.id`

## `stable_core_profiles`

| 字段 | 类型 | 可为空 |
| --- | --- | --- |
| `id` | `VARCHAR` | `否` |
| `user_id` | `VARCHAR` | `否` |
| `content` | `TEXT` | `否` |
| `source_summary` | `TEXT` | `是` |
| `source_signature` | `VARCHAR` | `是` |
| `created_at` | `TIMESTAMP` | `否` |
| `updated_at` | `TIMESTAMP` | `否` |

索引：
- `ix_stable_core_profiles_user_id_updated_at`：`user_id`、`updated_at`（普通索引）
- `uq_stable_core_profiles_user_id`：`user_id`（唯一索引）

唯一约束：
- `uq_stable_core_profiles_user_id`：`user_id`

外键：
- `stable_core_profiles_user_id_fkey`：`user_id` -> `users.id`

## `users`

| 字段 | 类型 | 可为空 |
| --- | --- | --- |
| `id` | `VARCHAR` | `否` |
| `role` | `VARCHAR` | `否` |
| `nickname` | `VARCHAR` | `是` |
| `email` | `VARCHAR` | `是` |
| `password_hash` | `VARCHAR` | `是` |
| `status` | `VARCHAR` | `否` |
| `storage_quota` | `INTEGER` | `是` |
| `created_at` | `TIMESTAMP` | `否` |
| `last_login_at` | `TIMESTAMP` | `是` |

索引：
- `users_email_key`：`email`（唯一索引）

唯一约束：
- `users_email_key`：`email`

外键：
- 无
