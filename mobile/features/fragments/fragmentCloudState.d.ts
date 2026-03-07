import type { FragmentVisualizationPoint } from '@/types/fragment';

export function filterPointsByCluster(
  points: FragmentVisualizationPoint[],
  clusterId: number | 'all'
): FragmentVisualizationPoint[];

export function toggleSelectedIds(currentIds: string[], fragmentId: string): string[];

export function selectVisibleIds(
  currentIds: string[],
  points: Array<{ id: string }>
): string[];

export function clearVisibleIds(
  currentIds: string[],
  points: Array<{ id: string }>
): string[];

export function countVisibleSelected(
  points: Array<{ id: string }>,
  selectedIds: string[]
): number;
