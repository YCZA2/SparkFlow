import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';

import { useFragmentVisualization } from '@/features/fragments/hooks';
import { CLOUD_HEIGHT } from '@/features/fragments/fragmentCloud';
import {
  clearVisibleIds,
  countVisibleSelected,
  filterPointsByCluster,
  selectVisibleIds,
  toggleSelectedIds,
} from '@/features/fragments/fragmentCloudState';

export function useFragmentCloudScreen() {
  const router = useRouter();
  const { visualization, isLoading, error, reloadVisualization } = useFragmentVisualization();

  const [activeClusterId, setActiveClusterId] = useState<number | 'all'>('all');
  const [focusedPointId, setFocusedPointId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [cloudSize, setCloudSize] = useState({ width: 0, height: CLOUD_HEIGHT });

  const points = visualization?.points ?? [];
  const clusters = visualization?.clusters ?? [];
  const stats = visualization?.stats;

  const filteredPoints = useMemo(() => {
    return filterPointsByCluster(points, activeClusterId);
  }, [activeClusterId, points]);

  const focusedPoint = useMemo(
    () => filteredPoints.find((point) => point.id === focusedPointId) ?? filteredPoints[0] ?? null,
    [filteredPoints, focusedPointId]
  );

  useEffect(() => {
    if (activeClusterId !== 'all' && !clusters.some((cluster) => cluster.id === activeClusterId)) {
      setActiveClusterId('all');
    }
  }, [activeClusterId, clusters]);

  useEffect(() => {
    if (!focusedPoint) {
      setFocusedPointId(null);
      return;
    }
    if (focusedPoint.id !== focusedPointId) {
      setFocusedPointId(focusedPoint.id);
    }
  }, [focusedPoint, focusedPointId]);

  const selectedCount = selectedIds.length;
  const visibleSelectedCount = countVisibleSelected(filteredPoints, selectedIds);

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setCloudSize({
      width,
      height: height || CLOUD_HEIGHT,
    });
  };

  const toggleSelected = (fragmentId: string) => {
    setSelectedIds((current) => toggleSelectedIds(current, fragmentId));
  };

  const selectVisiblePoints = () => {
    setSelectedIds((current) => selectVisibleIds(current, filteredPoints));
  };

  const clearVisibleSelection = () => {
    setSelectedIds((current) => clearVisibleIds(current, filteredPoints));
  };

  const goGenerate = () => {
    router.push({
      pathname: '/generate',
      params: selectedIds.length > 0 ? { fragmentIds: selectedIds.join(',') } : {},
    });
    return true;
  };

  return {
    visualization,
    isLoading,
    error,
    reloadVisualization,
    points,
    clusters,
    stats,
    activeClusterId,
    setActiveClusterId,
    focusedPoint,
    setFocusedPointId,
    selectedIds,
    selectedCount,
    visibleSelectedCount,
    cloudSize,
    handleLayout,
    filteredPoints,
    toggleSelected,
    selectVisiblePoints,
    clearVisibleSelection,
    goGenerate,
    goBack: () => router.back(),
    goFragmentDetail: (fragmentId: string) => router.push(`/fragment/${fragmentId}`),
  };
}
