/**
 * Pipeline 任务系统类型定义（跨 fragment/script 共用）
 */

export type PipelineStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

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
