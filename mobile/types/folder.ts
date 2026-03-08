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
