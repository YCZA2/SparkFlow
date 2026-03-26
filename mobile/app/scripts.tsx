import React, { useCallback } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScriptCard } from '@/components/ScriptCard';
import { BackButton } from '@/components/layout/BackButton';
import { LoadingState, ScreenState } from '@/components/ScreenState';
import { useSingleFlightRouterPush } from '@/hooks/useSingleFlightRouterPush';
import { Text } from '@/components/Themed';
import { useScripts } from '@/features/scripts/hooks';
import { useAppTheme } from '@/theme/useAppTheme';
import type { Script } from '@/types/script';

export default function ScriptsScreen() {
  /*成稿列表采用和备忘录一致的“圆形返回 + 大标题 + 分组列表”结构。 */
  const router = useRouter();
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
      <View style={[styles.container, styles.centered, { backgroundColor: theme.colors.background }]}>
        <Stack.Screen options={{ title, headerShown: false }} />
        <LoadingState message="正在加载口播稿..." />
      </View>
    );
  }

  if (error && items.length === 0) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.colors.background }]}>
        <Stack.Screen options={{ title, headerShown: false }} />
        <ScreenState
          icon="⚠️"
          title="加载失败"
          message={error}
          actionLabel="点击重试"
          onAction={reload}
          secondaryActionLabel="网络设置"
          onSecondaryAction={() => router.push('/network-settings')}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Stack.Screen options={{ title, headerShown: false }} />
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={
          <View style={[styles.headerBlock, { paddingTop: insets.top + 12 }]}>
            <BackButton color={theme.colors.text} variant="circle" showText={false} />
            <View style={styles.heroBlock}>
              <Text style={[styles.heroTitle, { color: theme.colors.text }]}>{title}</Text>
              <Text style={[styles.heroSubtitle, { color: theme.colors.textSubtle }]}>
                {subtitle}
              </Text>
            </View>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
  },
  headerBlock: {
    paddingHorizontal: 16,
  },
  heroBlock: {
    marginTop: 18,
    marginBottom: 14,
  },
  heroTitle: {
    fontSize: 32,
    lineHeight: 36,
    fontWeight: '800',
    letterSpacing: -0.9,
  },
  heroSubtitle: {
    marginTop: 3,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
  },
});
