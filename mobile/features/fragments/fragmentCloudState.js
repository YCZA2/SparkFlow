export function filterPointsByCluster(points, clusterId) {
  if (clusterId === 'all') {
    return points;
  }
  return points.filter((point) => point.cluster_id === clusterId);
}

export function toggleSelectedIds(currentIds, fragmentId) {
  if (currentIds.includes(fragmentId)) {
    return currentIds.filter((id) => id !== fragmentId);
  }
  return [...currentIds, fragmentId];
}

export function selectVisibleIds(currentIds, points) {
  const merged = new Set(currentIds);
  points.forEach((point) => merged.add(point.id));
  return Array.from(merged);
}

export function clearVisibleIds(currentIds, points) {
  const visibleIds = new Set(points.map((point) => point.id));
  return currentIds.filter((id) => !visibleIds.has(id));
}

export function countVisibleSelected(points, selectedIds) {
  return points.filter((point) => selectedIds.includes(point.id)).length;
}
