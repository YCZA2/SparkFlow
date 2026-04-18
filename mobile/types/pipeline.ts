/**
 * Legacy pipeline 类型兼容导出。
 * 新主链路已切换到 types/task.ts，但旧文件路径先保留给兼容 import。
 */

export type {
  RetryTaskRequest as RetryPipelineRequest,
  TaskResourcePreview as PipelineResourcePreview,
  TaskRun as PipelineRun,
  TaskStatus as PipelineStatus,
  TaskStep as PipelineStep,
  TaskStepListResponse as PipelineStepListResponse,
} from './task';
