import React from 'react';
import { LayoutChangeEvent, TouchableOpacity, View } from 'react-native';

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
  /*渲染灵感云图外壳和静态装饰，点位坐标继续保留运行时样式。 */
  const theme = useAppTheme();

  return (
    <View
      className="rounded-sf-card bg-app-surface p-4 dark:bg-app-surface-dark"
      style={[theme.shadow.card, { backgroundColor: theme.colors.surface }]}
    >
      <View className="flex-row justify-between gap-3">
        <View>
          <Text className="text-lg font-bold text-app-text dark:text-app-text-dark">
            {activeClusterId === 'all' ? '全量灵感分布' : '当前主题视图'}
          </Text>
          <Text className="mt-1.5 max-w-[220px] text-[13px] leading-[18px] text-app-text-subtle dark:text-app-text-subtle-dark">
            当前显示 {filteredPoints.length} 个点位
            {clustersLength === 0 ? '，数据还不够多，暂时只展示分布。' : '，点越大代表 z 轴越靠前。'}
          </Text>
        </View>
        <View className="items-end gap-2">
          <TouchableOpacity
            className="rounded-full bg-app-surface-muted px-3 py-2 dark:bg-app-surface-muted-dark"
            onPress={onSelectVisible}
            activeOpacity={0.85}
          >
            <Text className="text-xs font-semibold text-app-text dark:text-app-text-dark">全选当前</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="rounded-full bg-app-surface-muted px-3 py-2 dark:bg-app-surface-muted-dark"
            onPress={onClearVisible}
            activeOpacity={0.85}
          >
            <Text className="text-xs font-semibold text-app-text dark:text-app-text-dark">清空当前</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View
        className="mt-4 overflow-hidden rounded-[22px] border bg-app-surface-muted dark:bg-app-surface-muted-dark"
        style={{
          height: CLOUD_HEIGHT,
          backgroundColor: theme.colors.surfaceMuted,
          borderColor: theme.colors.border,
        }}
        onLayout={onLayout}
      >
        <View
          className="absolute right-[-40px] top-[-30px] h-[220px] w-[220px] rounded-full"
          style={{ opacity: 0.45, backgroundColor: theme.colors.background }}
        />
        <View
          className="absolute bottom-[-30px] left-[-20px] h-[180px] w-[180px] rounded-full"
          style={{ opacity: 0.65, backgroundColor: theme.colors.surface }}
        />

        {filteredPoints.map((point) => {
          const isFocused = point.id === focusedPointId;
          const isSelected = selectedIds.includes(point.id);
          const size = pointSize(point, isFocused, isSelected);
          const position = projectPoint(point, cloudWidth || 320, cloudHeight || CLOUD_HEIGHT, size);
          const color = getClusterColor(point.cluster_id, theme.colors.textSubtle);

          return (
            <TouchableOpacity
              key={point.id}
              className="absolute"
              style={{
                width: size,
                height: size,
                borderRadius: size / 2,
                left: position.left,
                top: position.top,
                backgroundColor: color,
                opacity: 0.62 + ((point.z + 1) / 2) * 0.28,
                borderColor: isFocused ? '#FFFFFF' : theme.colors.background,
                borderWidth: isFocused || isSelected ? 2 : 0,
              }}
              onPress={() => onPressPoint(point.id)}
              activeOpacity={0.9}
            />
          );
        })}
      </View>

      <Text className="mt-3 text-xs text-app-text-subtle dark:text-app-text-subtle-dark">
        已在待生成列表中选中 {selectedCount} 条，其中当前筛选下 {visibleSelectedCount} 条
      </Text>
    </View>
  );
}
