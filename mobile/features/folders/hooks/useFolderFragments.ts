import { useFragmentListScreenState } from '@/features/fragments/useFragmentListScreenState';

/**
 * 文件夹内碎片管理 Hook
 */
export function useFolderFragments(folderId: string, folderName?: string) {
  /*文件夹页直接复用统一列表 view-model，避免和首页分叉实现。 */
  return useFragmentListScreenState({ folderId, folderName });
}
