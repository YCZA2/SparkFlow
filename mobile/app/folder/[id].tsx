import React, { useCallback, useEffect } from 'react';
import {
  RefreshControl,
  SectionList,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';

import { FragmentCard } from '@/components/FragmentCard';
import { ScreenContainer } from '@/components/layout/ScreenContainer';
import { LoadingState, ScreenState } from '@/components/ScreenState';
import { Text } from '@/components/Themed';
import { useAppTheme } from '@/theme/useAppTheme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFolderFragments } from '@/features/folders/hooks';
import { useQuickActionBar } from '@/providers/QuickActionBarProvider';

// 返回按钮组件（与全局统一组件保持一致）
function FolderBackButton({ onPress, color }: { onPress: () => void; color: string }) {
  return (
    <TouchableOpacity onPress={onPress} hitSlop={8} activeOpacity={0.6} style={styles.backButton}>
      <SymbolView name="chevron.left" size={22} tintColor={color} />
      <Text style={[styles.backButtonText, { color }]}>返回</Text>
    </TouchableOpacity>
  );
}

// 选择按钮组件
function SelectButton({
  isSelectionMode,
  onPress,
  color,
}: {
  isSelectionMode: boolean;
  onPress: () => void;
  color: string;
}) {
  return (
    <TouchableOpacity onPress={onPress} hitSlop={8} style={styles.selectButton}>
      <Text style={[styles.selectAction, { color }]}>
        {isSelectionMode ? '取消' : '选择'}
      </Text>
    </TouchableOpacity>
  );
}

export default function FolderDetailScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const screen = useFolderFragments(id);
  const { setVisible } = useQuickActionBar();

  // 选择模式下隐藏 QuickActionBar，退出时恢复显示
  useEffect(() => {
    setVisible(!screen.selection.isSelectionMode);
  }, [screen.selection.isSelectionMode, setVisible]);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  if (screen.isLoading && screen.fragments.length === 0) {
    return (
      <ScreenContainer>
        <LoadingState message="正在加载碎片..." />
      </ScreenContainer>
    );
  }

  if (screen.error && screen.fragments.length === 0) {
    return (
      <ScreenContainer>
        <ScreenState
          icon="⚠️"
          title="加载失败"
          message={screen.error}
          actionLabel="点击重试"
          onAction={screen.reload}
        />
      </ScreenContainer>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* 悬浮顶部导航栏 - 移到最前面确保点击事件优先 */}
      <View style={[styles.floatingHeader, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerContent}>
          <FolderBackButton onPress={handleBack} color={theme.colors.text} />
          <View style={styles.headerTitleContainer}>
            <Text style={[styles.headerTitle, { color: theme.colors.text }]} numberOfLines={1}>
              {name || '文件夹'}
            </Text>
            <Text style={[styles.subtitle, { color: theme.colors.textSubtle }]}>
              {screen.totalLabel}
            </Text>
          </View>
          <SelectButton
            isSelectionMode={screen.selection.isSelectionMode}
            onPress={screen.selection.toggleSelectionMode}
            color={theme.colors.primary}
          />
        </View>
      </View>

      {/* 顶部渐隐遮罩 - 减小高度避免与返回按钮重叠 */}
      <LinearGradient
        colors={[theme.colors.background, `${theme.colors.background}00`]}
        locations={[0.3, 1]}
        style={[styles.topFade, { height: insets.top + 50 }]}
        pointerEvents="none"
      />

      {/* 列表内容 */}
      <SectionList
        sections={screen.sections}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index, section }) => (
          <FragmentCard
            fragment={item}
            onPress={screen.onFragmentPress}
            selectable={screen.selection.isSelectionMode}
            selected={screen.selection.selectedSet.has(item.id)}
            isFirstInSection={index === 0}
            isLastInSection={index === section.data.length - 1}
          />
        )}
        renderSectionHeader={({ section }) => (
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{section.title}</Text>
        )}
        ListEmptyComponent={
          <ScreenState icon="📝" title="还没有灵感碎片" message="去录一条或记一条吧" />
        }
        contentContainerStyle={[
          screen.fragments.length === 0 ? styles.emptyList : styles.list,
          { paddingTop: insets.top + 70, paddingBottom: insets.bottom + 100 }
        ]}
        refreshControl={
          <RefreshControl
            refreshing={screen.isRefreshing}
            onRefresh={screen.refresh}
            tintColor={theme.colors.primary}
          />
        }
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
      />

      {/* 底部渐隐遮罩 */}
      <LinearGradient
        colors={[`${theme.colors.background}00`, theme.colors.background]}
        locations={[0, 0.7]}
        style={[styles.bottomFade, { height: insets.bottom + 100 }]}
        pointerEvents="none"
      />

      {/* 悬浮底部操作栏 - 选择模式 */}
      {screen.selection.isSelectionMode && (
        <View style={[styles.floatingFooter, { bottom: insets.bottom + 20 }]}>
          <Animated.View
            entering={FadeInDown.duration(160)}
            exiting={FadeOutDown.duration(120)}
            style={[
              styles.selectionBar,
              theme.shadow.card,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.generateButton,
                {
                  backgroundColor:
                    screen.selection.selectedCount > 0
                      ? theme.colors.primary
                      : theme.colors.textSubtle,
                },
              ]}
              onPress={screen.onGenerate}
              activeOpacity={0.85}
            >
              <Text style={styles.generateButtonText}>
                交给 AI 编导（已选 {screen.selection.selectedCount}/{screen.selection.maxSelection} 条）
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // 悬浮顶部导航栏
  floatingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    backgroundColor: 'transparent',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 8,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  // 返回按钮样式
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingRight: 8,
    minWidth: 44,
    minHeight: 44,
  },
  backButtonText: {
    fontSize: 17,
    fontWeight: '400',
    marginLeft: 2,
  },
  // 选择按钮样式
  selectButton: {
    minWidth: 44,
    alignItems: 'flex-end',
  },
  selectAction: {
    fontSize: 16,
    fontWeight: '600',
  },
  // 列表样式
  list: {
    paddingHorizontal: 0,
  },
  emptyList: {
    flexGrow: 1,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 4,
    marginLeft: 16,
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // 渐隐遮罩
  topFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 90,
  },
  bottomFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 90,
  },
  // 悬浮底部操作栏
  floatingFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
  },
  selectionBar: {
    width: '90%',
    maxWidth: 420,
    borderRadius: 26,
    borderWidth: 1,
    padding: 10,
  },
  generateButton: {
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  generateButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
