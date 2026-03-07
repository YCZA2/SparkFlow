import React from 'react';
import { LayoutChangeEvent, StyleSheet, TouchableOpacity, View } from 'react-native';

import { Text } from '@/components/Themed';
import {
  CLOUD_HEIGHT,
  getClusterColor,
  pointSize,
  projectPoint,
} from '@/features/fragments/fragmentCloud';
import { useAppTheme } from '@/theme/useAppTheme';
import type { FragmentVisualizationPoint } from '@/types/fragment';

interface CloudCanvasProps {
  activeClusterId: number | 'all';
  clustersLength: number;
  filteredPoints: FragmentVisualizationPoint[];
  focusedPointId: string | null;
  selectedIds: string[];
  selectedCount: number;
  visibleSelectedCount: number;
  cloudWidth: number;
  cloudHeight: number;
  onLayout: (event: LayoutChangeEvent) => void;
  onSelectVisible: () => void;
  onClearVisible: () => void;
  onPressPoint: (fragmentId: string) => void;
}

export function CloudCanvas({
  activeClusterId,
  clustersLength,
  filteredPoints,
  focusedPointId,
  selectedIds,
  selectedCount,
  visibleSelectedCount,
  cloudWidth,
  cloudHeight,
  onLayout,
  onSelectVisible,
  onClearVisible,
  onPressPoint,
}: CloudCanvasProps) {
  const theme = useAppTheme();

  return (
    <View style={[styles.cloudCard, theme.shadow.card, { backgroundColor: theme.colors.surface }]}>
      <View style={styles.cloudHeader}>
        <View>
          <Text style={[styles.cloudTitle, { color: theme.colors.text }]}>
            {activeClusterId === 'all' ? '全量灵感分布' : '当前主题视图'}
          </Text>
          <Text style={[styles.cloudSubtitle, { color: theme.colors.textSubtle }]}>
            当前显示 {filteredPoints.length} 个点位
            {clustersLength === 0 ? '，数据还不够多，暂时只展示分布。' : '，点越大代表 z 轴越靠前。'}
          </Text>
        </View>
        <View style={styles.cloudActions}>
          <TouchableOpacity
            style={[styles.smallAction, { backgroundColor: theme.colors.surfaceMuted }]}
            onPress={onSelectVisible}
            activeOpacity={0.85}
          >
            <Text style={[styles.smallActionText, { color: theme.colors.text }]}>全选当前</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.smallAction, { backgroundColor: theme.colors.surfaceMuted }]}
            onPress={onClearVisible}
            activeOpacity={0.85}
          >
            <Text style={[styles.smallActionText, { color: theme.colors.text }]}>清空当前</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View
        style={[
          styles.cloudCanvas,
          {
            backgroundColor: theme.colors.surfaceMuted,
            borderColor: theme.colors.border,
          },
        ]}
        onLayout={onLayout}
      >
        <View style={[styles.backgroundOrb, { backgroundColor: theme.colors.background }]} />
        <View style={[styles.backgroundOrbSecondary, { backgroundColor: theme.colors.surface }]} />

        {filteredPoints.map((point) => {
          const isFocused = point.id === focusedPointId;
          const isSelected = selectedIds.includes(point.id);
          const size = pointSize(point, isFocused, isSelected);
          const position = projectPoint(point, cloudWidth || 320, cloudHeight || CLOUD_HEIGHT, size);
          const color = getClusterColor(point.cluster_id, theme.colors.textSubtle);

          return (
            <TouchableOpacity
              key={point.id}
              style={[
                styles.point,
                {
                  width: size,
                  height: size,
                  borderRadius: size / 2,
                  left: position.left,
                  top: position.top,
                  backgroundColor: color,
                  opacity: 0.62 + ((point.z + 1) / 2) * 0.28,
                  borderColor: isFocused ? '#FFFFFF' : theme.colors.background,
                  borderWidth: isFocused || isSelected ? 2 : 0,
                },
              ]}
              onPress={() => onPressPoint(point.id)}
              activeOpacity={0.9}
            />
          );
        })}
      </View>

      <Text style={[styles.selectionHint, { color: theme.colors.textSubtle }]}>
        已在待生成列表中选中 {selectedCount} 条，其中当前筛选下 {visibleSelectedCount} 条
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cloudCard: {
    borderRadius: 18,
    padding: 16,
  },
  cloudHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  cloudTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  cloudSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
    maxWidth: 220,
  },
  cloudActions: {
    alignItems: 'flex-end',
    gap: 8,
  },
  smallAction: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  smallActionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  cloudCanvas: {
    height: CLOUD_HEIGHT,
    borderRadius: 22,
    marginTop: 16,
    overflow: 'hidden',
    borderWidth: 1,
  },
  backgroundOrb: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    right: -40,
    top: -30,
    opacity: 0.45,
  },
  backgroundOrbSecondary: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    left: -20,
    bottom: -30,
    opacity: 0.65,
  },
  point: {
    position: 'absolute',
  },
  selectionHint: {
    fontSize: 12,
    marginTop: 12,
  },
});
