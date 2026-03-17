import React, { useCallback } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { ScriptCard } from '@/components/ScriptCard';
import { ScreenContainer } from '@/components/layout/ScreenContainer';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { BackButton } from '@/components/layout/BackButton';
import { LoadingState, ScreenState } from '@/components/ScreenState';
import { Text } from '@/components/Themed';
import { useScripts } from '@/features/scripts/hooks';
import { useAppTheme } from '@/theme/useAppTheme';

export default function ScriptsScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const { source_fragment_id } = useLocalSearchParams<{ source_fragment_id?: string }>();
  const sourceFragmentId = typeof source_fragment_id === 'string' ? source_fragment_id : null;
  const { items, isLoading, isRefreshing, error, reload, refresh } = useScripts({
    sourceFragmentId,
  });
  const isRelatedScriptsMode = Boolean(sourceFragmentId);
  const title = isRelatedScriptsMode ? '关联成稿' : '成稿';
  const subtitle = isRelatedScriptsMode
    ? '查看这条碎片已经衍生出的成稿，继续修改或进入拍摄。'
    : '查看已经生成的稿件，继续修改、拍摄或回看。';
  const emptyTitle = isRelatedScriptsMode ? '还没有关联成稿' : '还没有口播稿';
  const emptyMessage = isRelatedScriptsMode
    ? '这条碎片暂时还没有生成过成稿。'
    : '去碎片页选择灵感，生成你的第一篇口播稿';

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  if (isLoading && items.length === 0) {
    return (
      <ScreenContainer>
        <Stack.Screen options={{ title, headerShown: false }} />
        <LoadingState message="正在加载口播稿..." />
      </ScreenContainer>
    );
  }

  if (error && items.length === 0) {
    return (
      <ScreenContainer>
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
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <Stack.Screen options={{ title, headerShown: false }} />
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ScriptCard script={item} onPress={(script) => router.push(`/script/${script.id}`)} />
        )}
        ListHeaderComponent={
          <View style={styles.header}>
            <ScreenHeader
              title={title}
              subtitle={subtitle}
              leading={<BackButton color={theme.colors.primary} />}
            />
            {items.length > 0 ? (
              <Text style={[styles.headerText, { color: theme.colors.textSubtle }]}>
                共 {items.length} 篇成稿
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <ScreenState
            icon="📄"
            title={emptyTitle}
            message={emptyMessage}
          />
        }
        contentContainerStyle={items.length === 0 ? styles.emptyList : styles.list}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            tintColor={theme.colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingBottom: 24,
  },
  emptyList: {
    flexGrow: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  headerText: {
    marginTop: -8,
    fontSize: 13,
  },
});
