let scriptsShouldRefresh = false;

/*在生成、拍摄或本地迁移完成后标记成稿列表待刷新。 */
export function markScriptsStale(): void {
  scriptsShouldRefresh = true;
}

/*页面聚焦时消费一次成稿刷新标记，避免重复触发列表重载。 */
export function consumeScriptsStale(): boolean {
  const shouldRefresh = scriptsShouldRefresh;
  scriptsShouldRefresh = false;
  return shouldRefresh;
}
