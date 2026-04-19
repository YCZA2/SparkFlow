import React, { useCallback } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScriptCard } from '@/components/ScriptCard';
import { isDeveloperToolsEnabled } from '@/constants/appConfig';
import { BackButton } from '@/components/layout/BackButton';
import { NotesListHero } from '@/components/layout/NotesListHero';
import { NotesListScreenShell } from '@/components/layout/NotesListScreenShell';
import { NotesScreenStateView } from '@/components/layout/NotesScreenStateView';
import { LoadingState, ScreenState } from '@/components/ScreenState';
import { useSingleFlightRouterPush } from '@/hooks/useSingleFlightRouterPush';
import { useScripts } from '@/features/scripts/hooks';
import { useAppTheme } from '@/theme/useAppTheme';
import type { Script } from '@/types/script';

export default function ScriptsScreen() {
  /*成稿列表复用统一列表壳层，继续保持轻量的圆形返回 + hero 结构。 */
  const router = useRouter();
  const developerToolsEnabled = isDeveloperToolsEnabled();
  const pushOnce = useSingleFlightRouterPush();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { source_fragment_id } = useLocalSearchParams<{ source_fragment_id?: string }>();
  const sourceFragmentId = typeof source_fragment_id === 'string' ? source_fragment_id : null;
  const { items, isLoading, isRefreshing, error, reload, refresh } = useScripts({
    sourceFragmentId,
  });
  const isRelatedScriptsMode = Boolean(sourceFragmentId);
  const title = isRelatedScriptsMode ? '关联成稿' : '全部成稿';
  const subtitle = isRelatedScriptsMode ? `${items.length} 篇关联成稿` : `${items.length} 篇成稿`;
  const emptyTitle = isRelatedScriptsMode ? '还没有关联成稿' : '还没有口播稿';
  const emptyMessage = isRelatedScriptsMode
    ? '这条碎片暂时还没有生成过成稿。'
    : '去碎片页选择灵感，生成你的第一篇口播稿。';

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const handleScriptPress = useCallback(
    (script: Script) => {
      /*成稿详情入口继续用单航班导航，避免快速连点时重复压栈。 */
      pushOnce(`/script/${script.id}`, `script:${script.id}`);
    },
    [pushOnce]
  );

  const renderItem = useCallback(
    ({ item, index }: { item: Script; index: number }) => (
      <ScriptCard
        script={item}
        onPress={handleScriptPress}
        isFirst={index === 0}
        isLast={index === items.length - 1}
      />
    ),
    [handleScriptPress, items.length]
  );

  if (isLoading && items.length === 0) {
    return (
      <NotesScreenStateView backgroundColor={theme.colors.background}>
        <Stack.Screen options={{ title, headerShown: false }} />
        <LoadingState message="正在加载口播稿..." />
      </NotesScreenStateView>
    );
  }

  if (error && items.length === 0) {
    return (
      <NotesScreenStateView backgroundColor={theme.colors.background}>
        <Stack.Screen options={{ title, headerShown: false }} />
        <ScreenState
          icon="⚠️"
          title="加载失败"
          message={error}
          actionLabel="点击重试"
          onAction={reload}
          secondaryActionLabel={developerToolsEnabled ? '网络设置' : undefined}
          onSecondaryAction={developerToolsEnabled ? () => router.push('/network-settings') : undefined}
        />
      </NotesScreenStateView>
    );
  }

  return (
    <NotesListScreenShell backgroundColor={theme.colors.background}>
      <Stack.Screen options={{ title, headerShown: false }} />
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={
          <View className="px-sf-screen" style={{ paddingTop: insets.top + 12 }}>
            <BackButton color={theme.colors.text} variant="circle" showText={false} />
            <NotesListHero title={title} subtitle={subtitle} className="mb-[14px] mt-[18px]" />
          </View>
        }
        ListEmptyComponent={<ScreenState icon="📄" title={emptyTitle} message={emptyMessage} />}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            tintColor={theme.colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </NotesListScreenShell>
  );
}
