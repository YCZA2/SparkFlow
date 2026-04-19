import React, { useCallback } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isDeveloperToolsEnabled } from '@/constants/appConfig';
import { LoadingState, ScreenState } from '@/components/ScreenState';
import { Text } from '@/components/Themed';
import { InputDialog } from '@/components/InputDialog';
import { NotesListHero } from '@/components/layout/NotesListHero';
import { NotesListScreenShell } from '@/components/layout/NotesListScreenShell';
import { NotesScreenStateView } from '@/components/layout/NotesScreenStateView';
import { consumePendingFragmentCleanupDirectly } from '@/features/fragments/cleanup/runtime';
import { FolderListRow } from '@/features/folders/components/FolderListRow';
import {
  HomeHeaderCircleButton,
  HomeMenuButton,
} from '@/features/folders/components/HomeHeaderButtons';
import { useFolders } from '@/features/folders/hooks';
import { buildHomeFolderListItems } from '@/features/folders/homeScreenState';
import { useDrawer } from '@/providers/DrawerProvider';
import { useAppTheme } from '@/theme/useAppTheme';
import type { FragmentFolder } from '@/types/folder';

export default function FoldersScreen() {
  /*首页主要负责把系统入口和用户文件夹组织成 Notes 风格分组列表。 */
  const theme = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const developerToolsEnabled = isDeveloperToolsEnabled();
  const { toggle } = useDrawer();
  const {
    folders,
    isLoading,
    isRefreshing,
    isCreating,
    error,
    allFragmentsCount,
    allScriptsCount,
    fetchFolders,
    refreshFolders,
    createNewFolder,
  } = useFolders();
  const [showCreateDialog, setShowCreateDialog] = React.useState(false);

  const homeList = React.useMemo(
    () =>
      buildHomeFolderListItems({
        folders,
        allFragmentsCount,
        allScriptsCount,
      }),
    [allFragmentsCount, allScriptsCount, folders]
  );

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
      <NotesScreenStateView backgroundColor={theme.colors.background}>
        <LoadingState message="正在加载文件夹..." />
      </NotesScreenStateView>
    );
  }

  if (error && folders.length === 0) {
    return (
      <NotesScreenStateView backgroundColor={theme.colors.background}>
        <ScreenState
          icon="⚠️"
          title="加载失败"
          message={error}
          actionLabel="点击重试"
          onAction={fetchFolders}
          secondaryActionLabel={developerToolsEnabled ? '网络设置' : undefined}
          onSecondaryAction={developerToolsEnabled ? () => router.push('/network-settings') : undefined}
        />
      </NotesScreenStateView>
    );
  }

  return (
    <>
      <NotesListScreenShell
        backgroundColor={theme.colors.background}
        overlay={
          <View
            pointerEvents="box-none"
            className="absolute left-sf-screen right-sf-screen flex-row items-center justify-between"
            style={{ top: insets.top + 12 }}
          >
            <HomeMenuButton onPress={toggle} color={theme.colors.text} />
            <View className="flex-row gap-[10px]">
              <HomeHeaderCircleButton
                icon="folder.badge.plus"
                onPress={() => setShowCreateDialog(true)}
                tintColor={isCreating ? theme.colors.textSubtle : theme.colors.text}
                disabled={isCreating}
              />
              <HomeHeaderCircleButton
                icon="square.and.pencil"
                onPress={() => router.push('/text-note')}
                tintColor={theme.colors.text}
              />
            </View>
          </View>
        }
        topFadeHeight={insets.top + 96}
        bottomFadeHeight={insets.bottom + 108}
      >
        <FlatList
          data={homeList.items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            if (item.kind === 'section') {
              return (
                <Text className="mx-sf-screen mb-[10px] mt-sf-md text-sm font-bold leading-5 text-app-text dark:text-app-text-dark">
                  {item.title}
                </Text>
              );
            }

            return (
              <FolderListRow
                folder={item.folder}
                onPress={handleFolderPress}
                icon={item.icon}
                countLabel={item.countLabel}
                countValue={item.countValue}
                isFirstInSection={item.isFirstInSection}
                isLastInSection={item.isLastInSection}
              />
            );
          }}
          ListHeaderComponent={
            <View className="px-sf-screen" style={{ paddingTop: insets.top + 66 }}>
              <NotesListHero title="文件夹" subtitle={`${homeList.total} 个文件夹`} variant="large" />
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
      </NotesListScreenShell>

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
            /*错误已在 hook 中处理，这里保持弹窗即可。 */
          }
        }}
        onCancel={() => setShowCreateDialog(false)}
      />
    </>
  );
}
