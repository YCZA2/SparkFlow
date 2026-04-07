import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';

import { Text } from '@/components/Themed';
import { listLocalFolders } from '@/features/folders/localStore';
import { useAppTheme } from '@/theme/useAppTheme';
import type { AppTheme } from '@/theme/tokens';
import type { FragmentFolder } from '@/types/folder';

interface MoveFolderModalProps {
  /** 当前碎片所在文件夹 id，高亮显示以区分 */
  currentFolderId: string | null | undefined;
  /** 模态框是否可见 */
  visible: boolean;
  /** 关闭模态框 */
  onClose: () => void;
  /** 用户选择目标文件夹后的回调，传入 null 表示移到"全部（无文件夹）" */
  onSelect: (folderId: string | null) => void;
}

/**
 展示文件夹选择底部弹框，供"移动碎片"操作使用。
 打开时加载本地文件夹列表，选中后回调目标文件夹 id。
 */
export function MoveFolderModal({
  currentFolderId,
  visible,
  onClose,
  onSelect,
}: MoveFolderModalProps) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const [folders, setFolders] = useState<FragmentFolder[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  /*每次打开时重新拉取本地文件夹列表，保证数据最新。*/
  const loadFolders = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await listLocalFolders();
      setFolders(result);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      void loadFolders();
    }
  }, [visible, loadFolders]);

  return (
    <Modal animationType="none" visible={visible} transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Animated.View
          entering={FadeIn.duration(160)}
          exiting={FadeOut.duration(120)}
          style={StyleSheet.absoluteFill}
        >
          <Pressable style={styles.backdrop} onPress={onClose} />
        </Animated.View>

        <Animated.View
          entering={SlideInDown.duration(220)}
          exiting={SlideOutDown.duration(180)}
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.background,
              paddingBottom: insets.bottom + 16,
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: theme.colors.border }]} />
          <Text style={[styles.title, { color: theme.colors.text }]}>移动到</Text>

          {isLoading ? (
            <ActivityIndicator style={styles.loader} color={theme.colors.primary} />
          ) : (
            <ScrollView
              style={styles.list}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              {/*"无文件夹"选项，将碎片从所有文件夹中移出。*/}
              <FolderRow
                name="无文件夹"
                isCurrent={!currentFolderId}
                isNone
                onPress={() => onSelect(null)}
                theme={theme}
              />
              {folders.map((folder) => (
                <FolderRow
                  key={folder.id}
                  name={folder.name}
                  isCurrent={folder.id === currentFolderId}
                  onPress={() => onSelect(folder.id)}
                  theme={theme}
                />
              ))}
              {folders.length === 0 && (
                <Text style={[styles.emptyText, { color: theme.colors.textSubtle }]}>
                  暂无文件夹，可在碎片列表页新建
                </Text>
              )}
            </ScrollView>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

interface FolderRowProps {
  name: string;
  isCurrent: boolean;
  isNone?: boolean;
  onPress: () => void;
  theme: AppTheme;
}

/*单个文件夹行，当前所在文件夹显示勾选标记。*/
function FolderRow({ name, isCurrent, isNone = false, onPress, theme }: FolderRowProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[styles.folderRow, { borderBottomColor: theme.colors.border }]}
    >
      <SymbolView
        name={isNone ? 'tray' : 'folder'}
        size={20}
        tintColor={isCurrent ? theme.colors.primary : theme.colors.textSubtle}
      />
      <Text
        style={[
          styles.folderName,
          {
            color: isCurrent ? theme.colors.primary : theme.colors.text,
            fontWeight: isCurrent ? '600' : '400',
          },
        ]}
      >
        {name}
      </Text>
      {isCurrent && (
        <SymbolView name="checkmark" size={16} tintColor={theme.colors.primary} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.28)',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: '70%',
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 999,
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
  },
  loader: {
    marginVertical: 32,
  },
  list: {
    flexGrow: 0,
  },
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  folderName: {
    flex: 1,
    fontSize: 16,
  },
  emptyText: {
    fontSize: 14,
    paddingVertical: 20,
    textAlign: 'center',
  },
});
