/**
 * 口播稿类型定义
 */

import type { PipelineStatus } from './pipeline';

// Pipeline 类型已迁移至 types/pipeline.ts，此处保留再导出以维持旧 import 路径兼容。
export type { PipelineResourcePreview, PipelineRun, PipelineStatus, PipelineStep, PipelineStepListResponse, RetryPipelineRequest } from './pipeline';

export type ScriptMode = 'mode_a' | 'mode_b';
export type ScriptStatus = 'draft' | 'ready' | 'filmed';
export type ScriptGenerationKind = 'manual' | 'daily_push';
export type ScriptCopyReason = 'conflict' | 'restore' | 'manual_duplicate';

export interface Script {
  id: string;
  title: string | null;
  body_html?: string | null;
  plain_text_snapshot?: string | null;
  mode: ScriptMode;
  source_fragment_ids: string[] | null;
  source_fragment_count: number;
  status: ScriptStatus;
  is_daily_push: boolean;
  created_at: string | null;
  updated_at?: string | null;
  generated_at?: string | null;
  generation_kind?: ScriptGenerationKind;
  is_filmed?: boolean;
  filmed_at?: string | null;
  trashed_at?: string | null;
  deleted_at?: string | null;
  copy_of_script_id?: string | null;
  copy_reason?: ScriptCopyReason | null;
  backup_status?: 'pending' | 'synced' | 'failed';
  entity_version?: number;
  last_backup_at?: string | null;
  last_modified_device_id?: string | null;
}

export interface ScriptListResponse {
  items: Script[];
  total: number;
  limit: number;
  offset: number;
}

export interface GenerateScriptRequest {
  fragment_ids: string[];
  fragment_snapshots?: Array<{
    id: string;
    body_html?: string | null;
    plain_text_snapshot?: string | null;
    summary?: string | null;
    tags?: string[] | null;
    source?: string;
    created_at?: string | null;
  }>;
  mode: ScriptMode;
  query_hint?: string;
  include_web_search?: boolean;
}

export interface ScriptGenerationTask {
  pipeline_run_id: string;
  pipeline_type: 'script_generation';
  status: PipelineStatus;
}
