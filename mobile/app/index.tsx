import React, { useCallback } from 'react';
import { FlatList, RefreshControl, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { LoadingState, ScreenState } from '@/components/ScreenState';
import { Text } from '@/components/Themed';
import { InputDialog } from '@/components/InputDialog';
import { consumePendingFragmentCleanupDirectly } from '@/features/fragments/cleanup/runtime';
import { useFolders } from '@/features/folders/hooks';
import { useDrawer } from '@/providers/DrawerProvider';
import { useAppTheme } from '@/theme/useAppTheme';
import type { FragmentFolder } from '@/types/folder';

type SymbolName = React.ComponentProps<typeof SymbolView>['name'];

type FolderRow = {
  kind: 'row';
  id: string;
  folder: FragmentFolder;
  icon: SymbolName;
  countLabel?: string;
  countValue: string;
};

type SectionRow = {
  kind: 'section';
  id: string;
  title: string;
};

type ListItem = FolderRow | SectionRow;

function getFolderIcon(folderId: string): SymbolName {
  /*系统行图标统一走显式映射，避免符号名在推断时退化成普通字符串。 */
  if (folderId === '__all__') return 'tray';
  if (folderId === '__scripts__') return 'doc.text';
  return 'folder';
}

function HeaderCircleButton({
  icon,
  onPress,
  tintColor,
  disabled,
}: {
  icon: SymbolName;
  onPress: () => void;
  tintColor: string;
  disabled?: boolean;
}) {
  /*首页顶部操作采用统一圆形按钮，视觉上向 iOS 备忘录靠拢。 */
  return (
    <TouchableOpacity onPress={onPress} hitSlop={8} style={styles.headerButton} disabled={disabled}>
      <SymbolView name={icon} size={20} tintColor={tintColor} />
    </TouchableOpacity>
  );
}

function MenuButton({ onPress, color }: { onPress: () => void; color: string }) {
  /*菜单入口保留为轻量圆形汉堡按钮，和右上操作形成一套视觉节奏。 */
  return (
    <TouchableOpacity onPress={onPress} hitSlop={8} style={styles.headerButton}>
      <View style={styles.hamburger}>
        <View style={[styles.hamburgerLine, { backgroundColor: color }]} />
        <View style={[styles.hamburgerLine, { backgroundColor: color }]} />
        <View style={[styles.hamburgerLine, { backgroundColor: color }]} />
      </View>
    </TouchableOpacity>
  );
}

function FolderCard({
  folder,
  onPress,
  icon,
  countLabel,
  countValue,
  isFirstInSection,
  isLastInSection,
}: {
  folder: FragmentFolder;
  onPress: (folder: FragmentFolder) => void;
  icon: SymbolName;
  countLabel?: string;
  countValue: string;
  isFirstInSection?: boolean;
  isLastInSection?: boolean;
}) {
  /*文件夹行采用分组列表样式，而不是厚重独立卡片。 */
  const theme = useAppTheme();

  return (
    <TouchableOpacity
      style={[
        styles.folderCard,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderTopLeftRadius: isFirstInSection ? 18 : 0,
          borderTopRightRadius: isFirstInSection ? 18 : 0,
          borderBottomLeftRadius: isLastInSection ? 18 : 0,
          borderBottomRightRadius: isLastInSection ? 18 : 0,
          marginTop: isFirstInSection ? 0 : StyleSheet.hairlineWidth,
        },
      ]}
      onPress={() => onPress(folder)}
      activeOpacity={0.84}
    >
      <View style={styles.folderLeading}>
        <SymbolView name={icon} size={21} tintColor="#D4A21D" />
      </View>
      <View style={styles.folderInfo}>
        <Text style={[styles.folderName, { color: theme.colors.text }]} numberOfLines={1}>
          {folder.name}
        </Text>
        <Text style={[styles.folderCount, { color: theme.colors.textSubtle }]}>
          {countLabel ?? `${folder.fragment_count} 条内容`}
        </Text>
      </View>
      <View style={styles.folderMeta}>
        <Text style={[styles.folderCountValue, { color: theme.colors.textSubtle }]}>
          {countValue}
        </Text>
        <SymbolView name="chevron.right" size={15} tintColor={theme.colors.textSubtle} />
      </View>
    </TouchableOpacity>
  );
}

export default function FoldersScreen() {
  /*首页主要负责把系统入口和用户文件夹组织成 Notes 风格分组列表。 */
  const theme = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { toggle } = useDrawer();
  const {
    folders,
    isLoading,
    isRefreshing,
    isCreating,
    error,
    total,
    allFragmentsCount,
    allScriptsCount,
    fetchFolders,
    refreshFolders,
    createNewFolder,
  } = useFolders();
  const [showCreateDialog, setShowCreateDialog] = React.useState(false);

  const displayFolders = React.useMemo(() => {
    const allFolder: FragmentFolder = {
      id: '__all__',
      name: '全部',
      fragment_count: allFragmentsCount,
      created_at: null,
      updated_at: null,
    };
    const scriptFolder: FragmentFolder | null =
      allScriptsCount > 0
        ? {
            id: '__scripts__',
            name: '成稿',
            fragment_count: allScriptsCount,
            created_at: null,
            updated_at: null,
          }
        : null;
    return [allFolder, ...(scriptFolder ? [scriptFolder] : []), ...folders];
  }, [allFragmentsCount, allScriptsCount, folders]);

  const listItems = React.useMemo<ListItem[]>(() => {
    const quickRows = displayFolders.slice(0, Math.min(displayFolders.length, 2)).map((folder) => ({
      kind: 'row' as const,
      id: folder.id,
      folder,
      icon: getFolderIcon(folder.id),
      countLabel: folder.id === '__scripts__' ? `${folder.fragment_count} 篇成稿` : undefined,
      countValue: folder.fragment_count.toLocaleString('zh-CN'),
    }));
    const folderRows = displayFolders.slice(2).map((folder) => ({
      kind: 'row' as const,
      id: folder.id,
      folder,
      icon: 'folder' as const,
      countValue: folder.fragment_count.toLocaleString('zh-CN'),
    }));

    return [
      { kind: 'section', id: 'system', title: '系统' },
      ...quickRows,
      ...(folderRows.length > 0
        ? [{ kind: 'section' as const, id: 'folders', title: '文件夹' }, ...folderRows]
        : []),
    ];
  }, [displayFolders]);

  const { firstRowBySection, lastRowBySection } = React.useMemo(() => {
    /*单次遍历同时计算每个分区的首尾行 id，避免两次独立 useMemo 重复扫描。 */
    const first = new Map<string, string>();
    const last = new Map<string, string>();
    let currentSection = '';
    for (const item of listItems) {
      if (item.kind === 'section') {
        currentSection = item.id;
        continue;
      }
      if (!first.has(currentSection)) first.set(currentSection, item.id);
      last.set(currentSection, item.id);
    }
    return { firstRowBySection: first, lastRowBySection: last };
  }, [listItems]);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        try {
          await consumePendingFragmentCleanupDirectly();
        } catch {
          /*兜底清理失败时静默保留 ticket，避免影响首页继续刷新。 */
        } finally {
          await fetchFolders();
        }
      })();
    }, [fetchFolders])
  );

  const handleFolderPress = useCallback(
    (folder: FragmentFolder) => {
      if (folder.id === '__scripts__') {
        router.push('/scripts');
        return;
      }
      router.push({
        pathname: '/folder/[id]',
        params: { id: folder.id, name: folder.name },
      });
    },
    [router]
  );

  if (isLoading && folders.length === 0) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.colors.background }]}>
        <LoadingState message="正在加载文件夹..." />
      </View>
    );
  }

  if (error && folders.length === 0) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.colors.background }]}>
        <ScreenState
          icon="⚠️"
          title="加载失败"
          message={error}
          actionLabel="点击重试"
          onAction={fetchFolders}
          secondaryActionLabel="网络设置"
          onSecondaryAction={() => router.push('/network-settings')}
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
        <MenuButton onPress={toggle} color={theme.colors.text} />
        <View style={styles.headerRightActions}>
          <HeaderCircleButton
            icon="folder.badge.plus"
            onPress={() => setShowCreateDialog(true)}
            tintColor={isCreating ? theme.colors.textSubtle : theme.colors.text}
            disabled={isCreating}
          />
          <HeaderCircleButton
            icon="square.and.pencil"
            onPress={() => router.push('/text-note')}
            tintColor={theme.colors.text}
          />
        </View>
      </View>

      <FlatList
        data={listItems}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          if (item.kind === 'section') {
            return <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{item.title}</Text>;
          }

          return (
            <FolderCard
              folder={item.folder}
              onPress={handleFolderPress}
              icon={item.icon}
              countLabel={item.countLabel}
              countValue={item.countValue}
              isFirstInSection={firstRowBySection.get('system') === item.id || firstRowBySection.get('folders') === item.id}
              isLastInSection={lastRowBySection.get('system') === item.id || lastRowBySection.get('folders') === item.id}
            />
          );
        }}
        ListHeaderComponent={
          <View style={[styles.headerBlock, { paddingTop: insets.top + 66 }]}>
            <View style={styles.heroBlock}>
              <Text style={[styles.heroTitle, { color: theme.colors.text }]}>文件夹</Text>
              <Text style={[styles.heroSubtitle, { color: theme.colors.textSubtle }]}>
                {total} 个文件夹
              </Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <ScreenState icon="📁" title="还没有文件夹" message="系统会自动创建文件夹，或从后端同步" />
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refreshFolders}
            tintColor={theme.colors.primary}
          />
        }
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

      <InputDialog
        visible={showCreateDialog}
        title="新建文件夹"
        placeholder="请输入文件夹名称"
        confirmText="创建"
        cancelText="取消"
        onConfirm={async (name) => {
          try {
            await createNewFolder(name);
            setShowCreateDialog(false);
          } catch {
            // 错误已在 hook 中处理，这里保持弹窗即可。
          }
        }}
        onCancel={() => setShowCreateDialog(false)}
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
  headerRightActions: {
    flexDirection: 'row',
    gap: 10,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E5EA',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  hamburger: {
    width: 18,
    height: 14,
    justifyContent: 'space-between',
  },
  hamburgerLine: {
    width: 18,
    height: 2.2,
    borderRadius: 1.1,
  },
  heroBlock: {
    marginTop: 12,
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 40,
    lineHeight: 44,
    fontWeight: '800',
    letterSpacing: -1.2,
  },
  heroSubtitle: {
    marginTop: 4,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
  },
  sectionTitle: {
    marginTop: 12,
    marginBottom: 10,
    marginHorizontal: 16,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  folderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  folderLeading: {
    width: 28,
    alignItems: 'flex-start',
  },
  folderInfo: {
    flex: 1,
    marginLeft: 6,
  },
  folderName: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '500',
  },
  folderCount: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
  },
  folderMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  folderCountValue: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '400',
  },
});
