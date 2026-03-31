import React, { useCallback, useEffect } from 'react';
import { RefreshControl, SectionList, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { FragmentCard } from '@/components/FragmentCard';
import { BackButton } from '@/components/layout/BackButton';
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
  /*文件夹页改为备忘录式页头 + 分组列表，保留现有选择和生成流程。 */
  const theme = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const screen = useFolderFragments(id, name);
  const { setVisible } = useQuickActionBar();

  useEffect(() => {
    setVisible(!screen.selection.isSelectionMode);
  }, [screen.selection.isSelectionMode, setVisible]);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  if (screen.isLoading && screen.fragments.length === 0) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.colors.background }]}>
        <LoadingState message="正在加载碎片..." />
      </View>
    );
  }

  if (screen.error && screen.fragments.length === 0) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.colors.background }]}>
        <ScreenState
          icon="⚠️"
          title="加载失败"
          message={screen.error}
          actionLabel="点击重试"
          onAction={screen.reload}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View
        pointerEvents="box-none"
        style={[styles.floatingHeader, { top: insets.top + 12 }]}
      >
        <BackButton onPress={handleBack} variant="circle" showText={false} />
        <SelectButton
          isSelectionMode={screen.selection.isSelectionMode}
          onPress={screen.selection.toggleSelectionMode}
          color={theme.colors.primary}
        />
      </View>

      <SectionList
        sections={screen.sections}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index, section }) => (
          <AnimatedFragmentListItem isRemoving={screen.removingFragmentIds.has(item.id)}>
            <FragmentCard
              fragment={item}
              onPress={screen.onFragmentPress}
              selectable={screen.selection.isSelectionMode}
              selected={screen.selection.selectedSet.has(item.id)}
              isFirstInSection={index === 0}
              isLastInSection={index === section.data.length - 1}
            />
          </AnimatedFragmentListItem>
        )}
        renderSectionHeader={({ section }) => (
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{section.title}</Text>
        )}
        ListHeaderComponent={
          <View style={[styles.headerBlock, { paddingTop: insets.top + 66 }]}>
            <View style={styles.heroBlock}>
              <Text style={[styles.heroTitle, { color: theme.colors.text }]} numberOfLines={2}>
                {name || '文件夹'}
              </Text>
              <Text style={[styles.heroSubtitle, { color: theme.colors.textSubtle }]}>
                {screen.totalLabel}
              </Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <ScreenState icon="📝" title="还没有灵感碎片" message="去录一条或记一条吧" />
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
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

      <LinearGradient
        colors={[theme.colors.background, `${theme.colors.background}00`]}
        locations={[0.18, 1]}
        style={[styles.topFade, { height: insets.top + 96 }]}
        pointerEvents="none"
      />

      <LinearGradient
        colors={[`${theme.colors.background}00`, theme.colors.background]}
        locations={[0, 0.78]}
        style={[styles.bottomFade, { height: insets.bottom + 108 }]}
        pointerEvents="none"
      />

      {screen.selection.isSelectionMode ? (
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
                <Text style={styles.generateButtonText}>
                  交给 AI 编导
                </Text>
              </View>
              <Text style={styles.generateHint}>
                已选 {screen.selection.selectedCount}/{screen.selection.maxSelection}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      ) : null}
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
  floatingHeader: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 8,
  },
  bottomFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 8,
  },
  heroBlock: {
    marginTop: 10,
    marginBottom: 12,
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
    alignItems: 'center',
    zIndex: 100,
  },
  selectionBar: {
    width: '92%',
    maxWidth: 420,
    borderRadius: 24,
    borderWidth: 1,
    padding: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  generateButton: {
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  generateContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  generateButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  generateHint: {
    marginTop: 2,
    color: 'rgba(255,255,255,0.86)',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
});
