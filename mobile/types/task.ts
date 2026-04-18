/**
 * 统一异步任务系统类型定义（跨 fragment/script 共用）
 */

export type TaskStatus = 'queued' | 'running' | 'retrying' | 'succeeded' | 'failed' | 'cancelled';

export interface TaskResourcePreview {
  resource_type: string | null;
  resource_id: string | null;
}

export interface TaskRun {
  id: string;
  task_type: string;
  status: TaskStatus;
  current_step: string | null;
  error_message: string | null;
  celery_root_id?: string | null;
  resource: TaskResourcePreview;
  output: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
  finished_at: string | null;
}

export interface TaskStep {
  step_name: string;
  status: TaskStatus | 'pending';
  attempt_count: number;
  max_attempts: number;
  celery_task_id?: string | null;
  error_message: string | null;
  output: Record<string, unknown>;
  external_ref: Record<string, unknown>;
  started_at: string | null;
  finished_at: string | null;
}

export interface TaskStepListResponse {
  items: TaskStep[];
}

export interface RetryTaskRequest {
  strategy: 'from_failed_step' | 'from_start';
}

export interface TaskSubmissionHandle {
  task_id: string;
  task_type: string;
  status_query_url: string;
  pipeline_run_id?: string | null;
  pipeline_type?: string | null;
}
