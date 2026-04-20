import { invalidateFolderQueries } from '@/features/folders/queries';

/**
 在导入、删除等会影响列表的操作后失效 fragment 相关查询。
 */
export function markFragmentsStale(): void {
  /*碎片变化会同时影响列表、详情和首页文件夹统计，因此一起失效。 */
  void Promise.allSettled([
    import('./queries').then(async ({ invalidateFragmentQueries }) => await invalidateFragmentQueries()),
    invalidateFolderQueries(),
  ]);
}
