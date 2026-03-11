let fragmentsShouldRefresh = false;

/**
 * 中文注释：在导入、删除等会影响列表的操作后标记碎片列表待刷新。
 */
export function markFragmentsStale(): void {
  fragmentsShouldRefresh = true;
}

/**
 * 中文注释：页面重新聚焦时消费一次刷新标记，避免重复请求。
 */
export function consumeFragmentsStale(): boolean {
  const shouldRefresh = fragmentsShouldRefresh;
  fragmentsShouldRefresh = false;
  return shouldRefresh;
}
