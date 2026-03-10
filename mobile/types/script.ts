/**
 * 口播稿类型定义
 */

export type ScriptMode = 'mode_a' | 'mode_b';
export type ScriptStatus = 'draft' | 'ready' | 'filmed';
export type PipelineStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface Script {
  id: string;
  title: string | null;
  content: string | null;
  body_markdown?: string | null;
  mode: ScriptMode;
  source_fragment_ids: string[] | null;
  source_fragment_count: number;
  status: ScriptStatus;
  is_daily_push: boolean;
  created_at: string | null;
}

export interface ScriptListResponse {
  items: Script[];
  total: number;
  limit: number;
  offset: number;
}

export interface GenerateScriptRequest {
  fragment_ids: string[];
  mode: ScriptMode;
  query_hint?: string;
  include_web_search?: boolean;
}

export interface ScriptGenerationTask {
  pipeline_run_id: string;
  pipeline_type: 'script_generation';
  status: PipelineStatus;
}

export interface PipelineResourcePreview {
  resource_type: string | null;
  resource_id: string | null;
}

export interface PipelineRun {
  id: string;
  pipeline_type: 'media_ingestion' | 'script_generation';
  status: PipelineStatus;
  current_step: string | null;
  error_message: string | null;
  resource: PipelineResourcePreview;
  output: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
  finished_at: string | null;
}

export interface PipelineStep {
  step_name: string;
  status: PipelineStatus | 'pending' | 'waiting_retry';
  attempt_count: number;
  max_attempts: number;
  error_message: string | null;
  output: Record<string, unknown>;
  external_ref: Record<string, unknown>;
  started_at: string | null;
  finished_at: string | null;
}

export interface PipelineStepListResponse {
  items: PipelineStep[];
}

export interface RetryPipelineRequest {
  strategy: 'from_failed_step' | 'from_start';
}
