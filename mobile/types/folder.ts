/**
 * 碎片文件夹类型定义
 */

/**
 * 文件夹数据模型
 */
export interface FragmentFolder {
  /** 文件夹ID */
  id: string;
  /** 文件夹名称 */
  name: string;
  /** 文件夹内碎片数量 */
  fragment_count: number;
  /** 创建时间 */
  created_at: string | null;
  /** 更新时间 */
  updated_at: string | null;
  /** 本地备份状态 */
  backup_status?: 'pending' | 'synced' | 'failed';
  /** 本地实体版本 */
  entity_version?: number;
  /** 上次备份时间 */
  last_backup_at?: string | null;
  /** tombstone 时间 */
  deleted_at?: string | null;
}

/**
 * 文件夹列表响应
 */
export interface FragmentFolderListResponse {
  /** 文件夹列表 */
  items: FragmentFolder[];
  /** 总数 */
  total: number;
}

/**
 * 创建文件夹请求
 */
export interface CreateFolderRequest {
  /** 文件夹名称 */
  name: string;
}

/**
 * 更新文件夹请求
 */
export interface UpdateFolderRequest {
  /** 文件夹名称 */
  name: string;
}
