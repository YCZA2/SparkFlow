/**
 * 碎片笔记类型定义
 */

/**
 * 碎片笔记数据模型
 */
export interface Fragment {
  /** 碎片ID */
  id: string;
  /** 音频文件路径 */
  audio_path: string | null;
  /** 转写文本 */
  transcript: string | null;
  /** AI一句话摘要 */
  summary: string | null;
  /** AI自动标签 */
  tags: string[] | null;
  /** 来源: voice | manual | video_parse */
  source: string;
  /** 同步状态: pending | syncing | synced | failed */
  sync_status: string;
  /** 创建时间 */
  created_at: string;
}

/**
 * 碎片列表分页响应
 */
export interface FragmentListResponse {
  /** 碎片列表 */
  items: Fragment[];
  /** 总数 */
  total: number;
  /** 分页限制 */
  limit: number;
  /** 偏移量 */
  offset: number;
}

/**
 * 创建碎片请求
 */
export interface CreateFragmentRequest {
  /** 转写文本 */
  transcript?: string;
  /** 来源 */
  source?: string;
}
