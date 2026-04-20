import { invalidateFolderQueries } from '@/features/folders/queries';

/*在生成、拍摄或本地迁移完成后失效成稿和首页统计查询。 */
export function markScriptsStale(): void {
  /*成稿变化也会影响首页系统区统计，因此联动失效文件夹查询。 */
  void Promise.allSettled([
    import('./queries').then(async ({ invalidateScriptQueries }) => await invalidateScriptQueries()),
    invalidateFolderQueries(),
  ]);
}
