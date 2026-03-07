import React from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';

import { Text } from '@/components/Themed';
import { LoadingState, ScreenState } from '@/components/ScreenState';
import { CloudCanvas } from '@/features/fragments/components/CloudCanvas';
import { ClusterFilter } from '@/features/fragments/components/ClusterFilter';
import { FragmentDetailCard } from '@/features/fragments/components/FragmentDetailCard';
import { useFragmentCloudScreen } from '@/features/fragments/useFragmentCloudScreen';
import { fragmentCloudScreenStyles as styles } from '@/features/fragments/fragmentCloudScreenStyles';
import { useAppTheme } from '@/theme/useAppTheme';

export default function FragmentCloudScreen() {
  const theme = useAppTheme();
  const screen = useFragmentCloudScreen();

  if (screen.isLoading && !screen.visualization) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Stack.Screen options={{ title: '灵感云图' }} />
        <LoadingState message="正在整理你的灵感向量..." />
      </View>
    );
  }

  if (screen.error && !screen.visualization) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
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
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
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
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Stack.Screen options={{ title: '灵感云图' }} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.heroCard, theme.shadow.card, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.kicker, { color: theme.colors.textSubtle }]}>SparkFlow Visualization</Text>
          <Text style={[styles.heroTitle, { color: theme.colors.text }]}>把零散灵感看成一片主题云</Text>
          <Text style={[styles.heroDesc, { color: theme.colors.textMuted }]}>点击点位看详情，按主题筛选，再带着选中的碎片继续生成口播稿。</Text>

          <View style={styles.statsRow}>
            <View style={[styles.statCard, { backgroundColor: theme.colors.surfaceMuted }]}>
              <Text style={[styles.statValue, { color: theme.colors.text }]}>
                {screen.stats?.total_fragments ?? screen.points.length}
              </Text>
              <Text style={[styles.statLabel, { color: theme.colors.textSubtle }]}>已上图碎片</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: theme.colors.surfaceMuted }]}>
              <Text style={[styles.statValue, { color: theme.colors.text }]}>
                {screen.stats?.clustered_fragments ?? 0}
              </Text>
              <Text style={[styles.statLabel, { color: theme.colors.textSubtle }]}>已成主题</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: theme.colors.surfaceMuted }]}>
              <Text style={[styles.statValue, { color: theme.colors.text }]}>
                {screen.stats?.uncategorized_fragments ?? 0}
              </Text>
              <Text style={[styles.statLabel, { color: theme.colors.textSubtle }]}>待积累</Text>
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
