import type { FragmentVisualizationPoint } from '@/types/fragment';

const CLOUD_COLORS = ['#2A9D8F', '#E76F51', '#F4A261', '#3A86FF', '#E63946', '#6A4C93'];
export const CLOUD_HEIGHT = 360;
const CLOUD_PADDING = 20;

export function getClusterColor(clusterId: number | null | undefined, fallback: string) {
  if (!clusterId) {
    return fallback;
  }
  return CLOUD_COLORS[(clusterId - 1) % CLOUD_COLORS.length];
}

export function getPointTitle(point: FragmentVisualizationPoint) {
  if (point.summary) return point.summary;
  if (point.transcript) return point.transcript.slice(0, 56);
  return '未命名灵感';
}

export function getPointBody(point: FragmentVisualizationPoint) {
  if (point.transcript) return point.transcript;
  if (point.summary) return point.summary;
  return '这条碎片暂无可展示内容。';
}

export function pointSize(point: FragmentVisualizationPoint, active: boolean, selected: boolean) {
  const zRatio = (point.z + 1) / 2;
  const base = 16 + zRatio * 16;
  if (active) return base + 6;
  if (selected) return base + 3;
  return base;
}

export function projectPoint(
  point: FragmentVisualizationPoint,
  width: number,
  height: number,
  size: number
) {
  const safeWidth = Math.max(width - CLOUD_PADDING * 2, 40);
  const safeHeight = Math.max(height - CLOUD_PADDING * 2, 40);
  const x = ((point.x + 1) / 2) * safeWidth + CLOUD_PADDING;
  const y = ((point.y + 1) / 2) * safeHeight + CLOUD_PADDING;

  return {
    left: Math.max(0, Math.min(width - size, x - size / 2)),
    top: Math.max(0, Math.min(height - size, y - size / 2)),
  };
}
