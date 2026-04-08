import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SwipeableFragmentCard } from '@/components/SwipeableFragmentCard';
import { BackButton } from '@/components/layout/BackButton';
import { NotesListHero } from '@/components/layout/NotesListHero';
import { NotesListScreenShell } from '@/components/layout/NotesListScreenShell';
import { NotesScreenStateView } from '@/components/layout/NotesScreenStateView';
import { LoadingState, ScreenState } from '@/components/ScreenState';
import { AnimatedFragmentListItem } from '@/features/fragments/components/AnimatedFragmentListItem';
import { Text } from '@/components/Themed';
import { useFolderFragments } from '@/features/folders/hooks';
import { useQuickActionBar } from '@/providers/QuickActionBarProvider';
import { useAppTheme } from '@/theme/useAppTheme';

function SelectButton({
  isSelectionMode,
  onPress,
  color,
}: {
  isSelectionMode: boolean;
  onPress: () => void;
  color: string;
}) {
  /*列表右上角操作保持轻量文本按钮，和备忘录“编辑”语义一致。 */
  return (
    <TouchableOpacity onPress={onPress} hitSlop={8} style={styles.selectButton}>
      <Text style={[styles.selectAction, { color }]}>
        {isSelectionMode ? '完成' : '编辑'}
      </Text>
    </TouchableOpacity>
  );
}

export default function FolderDetailScreen() {
  /*文件夹页改为共享列表壳层 + 分组列表，保留现有选择和生成流程。 */
  const theme = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const screen = useFolderFragments(id, name);
  const { setVisible } = useQuickActionBar();
  /*当前已滑开的碎片 ID，用于关闭其他卡片。*/
  const [openFragmentId, setOpenFragmentId] = useState<string | null>(null);
  /*父层每次请求收起所有卡片时递增，驱动子卡片执行一次 close。 */
  const [closeRequestVersion, setCloseRequestVersion] = useState(0);

  useEffect(() => {
    setVisible(!screen.selection.isSelectionMode);
  }, [screen.selection.isSelectionMode, setVisible]);

  useEffect(() => {
    if (!screen.selection.isSelectionMode || openFragmentId === null) {
      return;
    }
    setCloseRequestVersion((prev) => prev + 1);
    setOpenFragmentId(null);
  }, [openFragmentId, screen.selection.isSelectionMode]);

  useEffect(() => {
    if (openFragmentId === null) {
      return;
    }
    if (screen.fragments.some((fragment) => fragment.id === openFragmentId)) {
      return;
    }
    setOpenFragmentId(null);
  }, [openFragmentId, screen.fragments]);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  /*某张卡片滑开时，记录其 ID，其他卡片通过 shouldClose 判断关闭。*/
  const handleSwipeOpen = useCallback((fragmentId: string) => {
    setOpenFragmentId(fragmentId);
  }, []);

  /*卡片滑回关闭后同步清理页面级 open 状态，避免后续点击误判为仍在滑开。 */
  const handleSwipeClose = useCallback((fragmentId: string) => {
    setOpenFragmentId((current) => (current === fragmentId ? null : current));
  }, []);

  /*统一处理"关闭当前滑开卡片"动作，供空白点击、滚动和其他卡片点击复用。 */
  const requestCloseOpenCard = useCallback(() => {
    if (openFragmentId === null) {
      return false;
    }
    setCloseRequestVersion((prev) => prev + 1);
    return true;
  }, [openFragmentId]);

  /*有卡片滑开时，优先收起侧滑操作，不直接进入详情。 */
  const handleFragmentPress = useCallback(
    (fragment: Parameters<typeof screen.onFragmentPress>[0]) => {
      if (requestCloseOpenCard()) {
        return;
      }
      screen.onFragmentPress(fragment);
    },
    [requestCloseOpenCard, screen]
  );

  /*点击非卡片内容或开始滚动时，如果有滑开的卡片则先关闭。 */
  const handleDismissOpenSwipe = useCallback(() => {
    requestCloseOpenCard();
  }, [requestCloseOpenCard]);

  if (screen.isLoading && screen.fragments.length === 0) {
    return (
      <NotesScreenStateView backgroundColor={theme.colors.background}>
        <LoadingState message="正在加载碎片..." />
      </NotesScreenStateView>
    );
  }

  if (screen.error && screen.fragments.length === 0) {
    return (
      <NotesScreenStateView backgroundColor={theme.colors.background}>
        <ScreenState
          icon="⚠️"
          title="加载失败"
          message={screen.error}
          actionLabel="点击重试"
          onAction={screen.reload}
        />
      </NotesScreenStateView>
    );
  }

  return (
    <NotesListScreenShell
      backgroundColor={theme.colors.background}
      overlay={
        <View pointerEvents="box-none" style={[styles.floatingHeader, { top: insets.top + 12 }]}>
          <BackButton onPress={handleBack} variant="circle" showText={false} />
          <SelectButton
            isSelectionMode={screen.selection.isSelectionMode}
            onPress={screen.selection.toggleSelectionMode}
            color={theme.colors.primary}
          />
        </View>
      }
      topFadeHeight={insets.top + 96}
      bottomFadeHeight={insets.bottom + 108}
      bottomOverlay={
        screen.selection.isSelectionMode ? (
          <View style={[styles.floatingFooter, { bottom: insets.bottom + 18 }]}>
            <Animated.View
              entering={FadeInDown.duration(160)}
              exiting={FadeOutDown.duration(120)}
              style={[
                styles.selectionBar,
                {
                  backgroundColor:
                    theme.name === 'dark' ? 'rgba(28,28,30,0.96)' : 'rgba(255,255,255,0.96)',
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <TouchableOpacity
                style={[
                  styles.generateButton,
                  {
                    backgroundColor:
                      screen.selection.selectedCount > 0 ? theme.colors.warning : theme.colors.textSubtle,
                  },
                ]}
                onPress={screen.onGenerate}
                activeOpacity={0.85}
              >
                <View style={styles.generateContent}>
                  <SymbolView name="sparkles" size={18} tintColor="#FFFFFF" />
                  <Text style={styles.generateButtonText}>交给 AI 编导</Text>
                </View>
                <Text style={styles.generateHint}>
                  已选 {screen.selection.selectedCount}/{screen.selection.maxSelection}
                </Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        ) : null
      }
    >
      <SectionList
        sections={screen.sections}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index, section }) => (
          <AnimatedFragmentListItem isRemoving={screen.removingFragmentIds.has(item.id)}>
            <SwipeableFragmentCard
              fragment={item}
              onPress={handleFragmentPress}
              selectable={screen.selection.isSelectionMode}
              selected={screen.selection.selectedSet.has(item.id)}
              isFirstInSection={index === 0}
              isLastInSection={index === section.data.length - 1}
              onSwipeOpen={handleSwipeOpen}
              onSwipeClose={handleSwipeClose}
              shouldClose={openFragmentId !== null && openFragmentId !== item.id}
              closeRequestVersion={closeRequestVersion}
            />
          </AnimatedFragmentListItem>
        )}
        renderSectionHeader={({ section }) => (
          <Pressable disabled={openFragmentId === null} onPress={handleDismissOpenSwipe}>
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{section.title}</Text>
          </Pressable>
        )}
        ListHeaderComponent={
          <Pressable
            style={[styles.headerBlock, { paddingTop: insets.top + 66 }]}
            disabled={openFragmentId === null}
            onPress={handleDismissOpenSwipe}
          >
            <NotesListHero
              title={name || '文件夹'}
              subtitle={screen.totalLabel}
              titleLines={2}
            />
          </Pressable>
        }
        ListEmptyComponent={
          <Pressable disabled={openFragmentId === null} onPress={handleDismissOpenSwipe}>
            <ScreenState icon="📝" title="还没有灵感碎片" message="去录一条或记一条吧" />
          </Pressable>
        }
        ListFooterComponent={
          <Pressable
            style={styles.listFooterDismissArea}
            disabled={openFragmentId === null}
            onPress={handleDismissOpenSwipe}
          />
        }
        contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 110 }}
        refreshControl={
          <RefreshControl
            refreshing={screen.isRefreshing}
            onRefresh={screen.refresh}
            tintColor={theme.colors.primary}
          />
        }
        onTouchEnd={handleDismissOpenSwipe}
        onScrollBeginDrag={handleDismissOpenSwipe}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
      />
    </NotesListScreenShell>
  );
}

const styles = StyleSheet.create({
  headerBlock: {
    paddingHorizontal: 16,
  },
  floatingHeader: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  selectAction: {
    fontSize: 17,
    fontWeight: '500',
  },
  sectionTitle: {
    marginTop: 12,
    marginBottom: 8,
    marginLeft: 16,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  floatingFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 12,
    paddingHorizontal: 16,
  },
  selectionBar: {
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 22,
    elevation: 8,
  },
  generateButton: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  generateContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  generateButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
  },
  generateHint: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.92)',
    fontSize: 12,
    lineHeight: 16,
  },
  listFooterDismissArea: {
    flex: 1,
    minHeight: 120,
  },
});
