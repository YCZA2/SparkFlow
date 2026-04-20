import React from 'react';
import { TouchableOpacity, View, Text } from 'react-native';

import {
  getClusterColor,
  getPointBody,
  getPointTitle,
} from '@/features/fragments/fragmentCloud';
import { useAppTheme } from '@/theme/useAppTheme';
import type { FragmentVisualizationPoint } from '@/types/fragment';

interface FragmentDetailCardProps {
  point: FragmentVisualizationPoint;
  isSelected: boolean;
  onToggleSelected: () => void;
  onGenerate: () => void;
  onViewDetail: () => void;
}

export function FragmentDetailCard({
  point,
  isSelected,
  onToggleSelected,
  onGenerate,
  onViewDetail,
}: FragmentDetailCardProps) {
  const theme = useAppTheme();

  return (
    <View className="rounded-[18px] bg-app-surface p-sf-lg dark:bg-app-surface-dark" style={theme.shadow.card}>
      <View className="flex-row justify-between gap-sf-md">
        <View className="flex-1 flex-row items-start gap-[10px]">
          <View
            className="mt-[6px] h-sf-md w-sf-md rounded-full"
            style={[
              { backgroundColor: getClusterColor(point.cluster_id, theme.colors.textSubtle) },
            ]}
          />
          <View className="flex-1">
            <Text className="text-lg font-bold leading-6 text-app-text dark:text-app-text-dark">{getPointTitle(point)}</Text>
            <Text className="mt-[6px] text-xs text-app-text-subtle dark:text-app-text-subtle-dark">
              {point.created_at ? point.created_at.slice(0, 10) : '无时间'}
              {point.cluster_id ? ` · 主题 ${point.cluster_id}` : ' · 未分类'}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          className="self-start rounded-sf-pill px-sf-md py-[10px]"
          style={[
            {
              backgroundColor: isSelected ? theme.colors.primary : theme.colors.surfaceMuted,
            },
          ]}
          onPress={onToggleSelected}
          activeOpacity={0.85}
        >
          <Text className="text-xs font-bold" style={{ color: isSelected ? '#FFFFFF' : theme.colors.text }}>
            {isSelected ? '已加入待生成' : '加入待生成'}
          </Text>
        </TouchableOpacity>
      </View>

      <Text className="mt-sf-lg text-sm leading-[21px] text-app-text-muted dark:text-app-text-muted-dark">{getPointBody(point)}</Text>

      {point.tags?.length ? (
        <View className="mt-[14px] flex-row flex-wrap gap-sf-sm">
          {point.tags.map((tag) => (
            <View key={tag} className="rounded-sf-pill bg-app-surface-muted px-[10px] py-[6px] dark:bg-app-surface-muted-dark">
              <Text className="text-xs font-semibold text-app-text dark:text-app-text-dark">{tag}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View className="mt-[18px] flex-row gap-[10px]">
        <TouchableOpacity
          className="flex-1 items-center justify-center rounded-sf-md bg-app-primary py-[14px] dark:bg-app-primary-dark"
          onPress={onGenerate}
          activeOpacity={0.85}
        >
          <Text className="text-sm font-bold text-white">用已选碎片生成</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="flex-1 items-center justify-center rounded-sf-md bg-app-surface-muted py-[14px] dark:bg-app-surface-muted-dark"
          onPress={onViewDetail}
          activeOpacity={0.85}
        >
          <Text className="text-sm font-bold text-app-text dark:text-app-text-dark">查看碎片详情</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
