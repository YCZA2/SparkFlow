/**
 * 口播稿类型定义
 */

export type ScriptMode = 'mode_a' | 'mode_b';
export type ScriptStatus = 'draft' | 'ready' | 'filmed';

export interface Script {
  id: string;
  title: string | null;
  content: string | null;
  mode: ScriptMode;
  source_fragment_ids: string | null;
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
}
