import type { FragmentVisualizationPoint } from '@/types/fragment';

export function filterPointsByCluster(
  points: FragmentVisualizationPoint[],
  clusterId: number | 'all'
): FragmentVisualizationPoint[] {
  /*按聚类筛选可见点集，保持云图交互逻辑纯函数化。 */
  if (clusterId === 'all') {
    return points;
  }
  return points.filter((point) => point.cluster_id === clusterId);
}

export function toggleSelectedIds(currentIds: string[], fragmentId: string): string[] {
  /*维护云图选中态，重复点击同一点时允许取消选择。 */
  if (currentIds.includes(fragmentId)) {
    return currentIds.filter((id) => id !== fragmentId);
  }
  return [...currentIds, fragmentId];
}

export function selectVisibleIds(currentIds: string[], points: FragmentVisualizationPoint[]): string[] {
  /*批量选择当前筛选后的可见点，并保持结果去重。 */
  const merged = new Set(currentIds);
  points.forEach((point) => merged.add(point.id));
  return Array.from(merged);
}

export function clearVisibleIds(currentIds: string[], points: FragmentVisualizationPoint[]): string[] {
  /*仅清空当前可见点的选中态，保留其他筛选范围内的选择。 */
  const visibleIds = new Set(points.map((point) => point.id));
  return currentIds.filter((id) => !visibleIds.has(id));
}

export function countVisibleSelected(points: FragmentVisualizationPoint[], selectedIds: string[]): number {
  /*统计当前筛选范围内的已选数量，驱动批量操作提示。 */
  return points.filter((point) => selectedIds.includes(point.id)).length;
}
