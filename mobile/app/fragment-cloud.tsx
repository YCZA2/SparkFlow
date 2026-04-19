import React from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';

import { Text } from '@/components/Themed';
import { LoadingState, ScreenState } from '@/components/ScreenState';
import { CloudCanvas } from '@/features/fragments/components/CloudCanvas';
import { ClusterFilter } from '@/features/fragments/components/ClusterFilter';
import { FragmentDetailCard } from '@/features/fragments/components/FragmentDetailCard';
import { useFragmentCloudScreen } from '@/features/fragments/useFragmentCloudScreen';
import { useAppTheme } from '@/theme/useAppTheme';

export default function FragmentCloudScreen() {
  const theme = useAppTheme();
  const screen = useFragmentCloudScreen();

  if (screen.isLoading && !screen.visualization) {
    return (
      <View className="flex-1 bg-app-background dark:bg-app-background-dark">
        <Stack.Screen options={{ title: '灵感云图' }} />
        <LoadingState message="正在整理你的灵感向量..." />
      </View>
    );
  }

  if (screen.error && !screen.visualization) {
    return (
      <View className="flex-1 bg-app-background dark:bg-app-background-dark">
        <Stack.Screen options={{ title: '灵感云图' }} />
        <ScreenState
          icon="⚠️"
          title="云图加载失败"
          message={screen.error}
          actionLabel="重新加载"
          onAction={screen.reloadVisualization}
          secondaryActionLabel="返回碎片库"
          onSecondaryAction={screen.goBack}
        />
      </View>
    );
  }

  if (screen.points.length === 0) {
    return (
      <View className="flex-1 bg-app-background dark:bg-app-background-dark">
        <Stack.Screen options={{ title: '灵感云图' }} />
        <ScreenState
          icon="☁️"
          title="还没有可视化数据"
          message="先录入并完成几条碎片转写，系统会自动把已有向量排成云图。"
          actionLabel="返回碎片库"
          onAction={screen.goBack}
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-app-background dark:bg-app-background-dark">
      <Stack.Screen options={{ title: '灵感云图' }} />

      <ScrollView
        contentContainerClassName="gap-sf-screen px-sf-screen pb-8 pt-sf-screen"
        showsVerticalScrollIndicator={false}
      >
        <View
          className="rounded-sf-card px-[18px] py-[18px] dark:bg-app-surface-dark"
          style={[theme.shadow.card, { backgroundColor: theme.colors.surface }]}
        >
          <Text className="text-[12px] uppercase tracking-[1px] text-app-text-subtle dark:text-app-text-subtle-dark">
            SparkFlow Visualization
          </Text>
          <Text className="mt-[10px] text-[28px] font-bold leading-[34px] text-app-text dark:text-app-text-dark">
            把零散灵感看成一片主题云
          </Text>
          <Text className="mt-[10px] text-sm leading-5 text-app-text-muted dark:text-app-text-muted-dark">
            点击点位看详情，按主题筛选，再带着选中的碎片继续生成口播稿。
          </Text>

          <View className="mt-4 flex-row gap-2.5">
            <View className="flex-1 rounded-[14px] bg-app-surface-muted p-3 dark:bg-app-surface-muted-dark">
              <Text className="text-[22px] font-bold text-app-text dark:text-app-text-dark">
                {screen.stats?.total_fragments ?? screen.points.length}
              </Text>
              <Text className="mt-1.5 text-xs text-app-text-subtle dark:text-app-text-subtle-dark">已上图碎片</Text>
            </View>
            <View className="flex-1 rounded-[14px] bg-app-surface-muted p-3 dark:bg-app-surface-muted-dark">
              <Text className="text-[22px] font-bold text-app-text dark:text-app-text-dark">
                {screen.stats?.clustered_fragments ?? 0}
              </Text>
              <Text className="mt-1.5 text-xs text-app-text-subtle dark:text-app-text-subtle-dark">已成主题</Text>
            </View>
            <View className="flex-1 rounded-[14px] bg-app-surface-muted p-3 dark:bg-app-surface-muted-dark">
              <Text className="text-[22px] font-bold text-app-text dark:text-app-text-dark">
                {screen.stats?.uncategorized_fragments ?? 0}
              </Text>
              <Text className="mt-1.5 text-xs text-app-text-subtle dark:text-app-text-subtle-dark">待积累</Text>
            </View>
          </View>
        </View>

        <ClusterFilter
          clusters={screen.clusters}
          activeClusterId={screen.activeClusterId}
          onSelect={screen.setActiveClusterId}
        />

        <CloudCanvas
          activeClusterId={screen.activeClusterId}
          clustersLength={screen.clusters.length}
          filteredPoints={screen.filteredPoints}
          focusedPointId={screen.focusedPoint?.id ?? null}
          selectedIds={screen.selectedIds}
          selectedCount={screen.selectedCount}
          visibleSelectedCount={screen.visibleSelectedCount}
          cloudWidth={screen.cloudSize.width}
          cloudHeight={screen.cloudSize.height}
          onLayout={screen.handleLayout}
          onSelectVisible={screen.selectVisiblePoints}
          onClearVisible={screen.clearVisibleSelection}
          onPressPoint={screen.setFocusedPointId}
        />

        {screen.focusedPoint ? (
          <FragmentDetailCard
            point={screen.focusedPoint}
            isSelected={screen.selectedIds.includes(screen.focusedPoint.id)}
            onToggleSelected={() => screen.toggleSelected(screen.focusedPoint!.id)}
            onGenerate={() => {
              if (!screen.goGenerate()) {
                Alert.alert('还没选碎片', '先点几个点位加入待生成列表。');
              }
            }}
            onViewDetail={() => screen.goFragmentDetail(screen.focusedPoint!.id)}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}
