import React, { useCallback, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  PanResponder,
  Share,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { SymbolView } from 'expo-symbols';

import { Text } from '@/components/Themed';
import { FragmentCard } from '@/components/FragmentCard';
import { MoveFolderModal } from '@/components/MoveFolderModal';
import { getOrCreateDeviceId } from '@/features/auth/device';
import {
  deleteLocalFragmentEntity,
  updateLocalFragmentEntity,
} from '@/features/fragments/store';
import { markFragmentsStale } from '@/features/fragments/refreshSignal';
import { extractPlainTextFromHtml } from '@/features/editor/html';
import { useAppTheme } from '@/theme/useAppTheme';
import type { Fragment } from '@/types/fragment';

/** 触发滑开的最小水平偏移量（px）*/
const SWIPE_THRESHOLD = 60;

/** 操作按钮区域总宽度（px），3 个按钮各 70px */
const ACTIONS_WIDTH = 210;

interface SwipeableFragmentCardProps {
  fragment: Fragment;
  onPress?: (fragment: Fragment) => void;
  /** 选择模式下禁用左滑，直接透传给 FragmentCard */
  selectable?: boolean;
  selected?: boolean;
  isFirstInSection?: boolean;
  isLastInSection?: boolean;
  /** 当本卡片滑开时通知父组件，用于关闭其他已打开的卡片 */
  onSwipeOpen?: (fragmentId: string) => void;
  /** 外部传入的关闭信号：当 closeKey 变化时强制关闭 */
  closeKey?: number;
}

/**
 在 FragmentCard 基础上增加左滑操作区，暴露"共享、移动、删除"三个快捷操作。
 选择模式下左滑禁用，与多选交互互不干扰。
 */
export function SwipeableFragmentCard({
  fragment,
  onPress,
  selectable = false,
  selected = false,
  isFirstInSection = false,
  isLastInSection = false,
  onSwipeOpen,
  closeKey,
}: SwipeableFragmentCardProps) {
  const theme = useAppTheme();
  const translateX = useRef(new Animated.Value(0)).current;
  const isOpen = useRef(false);
  const [moveFolderVisible, setMoveFolderVisible] = useState(false);

  /*closeKey 变化时从外部关闭本卡片（其他卡片滑开时触发）。*/
  const prevCloseKeyRef = useRef(closeKey);
  if (closeKey !== prevCloseKeyRef.current) {
    prevCloseKeyRef.current = closeKey;
    if (isOpen.current) {
      isOpen.current = false;
      Animated.spring(translateX, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 0,
      }).start();
    }
  }

  /*弹簧动画滑开，露出操作按钮区。*/
  const open = useCallback(() => {
    isOpen.current = true;
    Animated.spring(translateX, {
      toValue: -ACTIONS_WIDTH,
      useNativeDriver: true,
      bounciness: 4,
    }).start();
    onSwipeOpen?.(fragment.id);
  }, [translateX, fragment.id, onSwipeOpen]);

  /*弹簧动画归位，收起操作按钮区。*/
  const close = useCallback(() => {
    isOpen.current = false;
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 0,
    }).start();
  }, [translateX]);

  /*仅处理水平为主的手势，避免与列表垂直滚动冲突。*/
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8,
      onPanResponderMove: (_, { dx }) => {
        /*左滑从当前状态叠加偏移，右滑不超过 0 避免卡片右移。*/
        const base = isOpen.current ? -ACTIONS_WIDTH : 0;
        const next = Math.min(0, Math.max(base + dx, -ACTIONS_WIDTH));
        translateX.setValue(next);
      },
      onPanResponderRelease: (_, { dx, vx }) => {
        const base = isOpen.current ? -ACTIONS_WIDTH : 0;
        const current = base + dx;
        const shouldOpen = current < -SWIPE_THRESHOLD || vx < -0.5;
        shouldOpen ? open() : close();
      },
      onPanResponderTerminate: () => close(),
    })
  ).current;

  /*共享：把碎片标题和摘要/正文纯文本分享到系统分享面板。*/
  const handleShare = useCallback(async () => {
    close();
    const title =
      (fragment.body_html ? extractPlainTextFromHtml(fragment.body_html) : null) ||
      fragment.plain_text_snapshot ||
      fragment.transcript ||
      fragment.summary ||
      '无标题灵感';
    const message = title.slice(0, 500);
    try {
      await Share.share({ message });
    } catch {
      // 用户取消或系统错误，静默忽略
    }
  }, [close, fragment]);

  /*移动：打开文件夹选择弹框。*/
  const handleMove = useCallback(() => {
    close();
    setMoveFolderVisible(true);
  }, [close]);

  /*移动确认：更新本地 fragment 的 folder_id 并标记需要备份。*/
  const handleFolderSelect = useCallback(
    async (folderId: string | null) => {
      setMoveFolderVisible(false);
      try {
        const deviceId = await getOrCreateDeviceId();
        await updateLocalFragmentEntity(fragment.id, {
          folder_id: folderId,
          backup_status: 'pending',
          last_modified_device_id: deviceId,
        });
        markFragmentsStale();
      } catch {
        Alert.alert('移动失败', '碎片移动失败，请重试');
      }
    },
    [fragment.id]
  );

  /*删除：弹出确认后执行本地软删除并刷新列表。*/
  const handleDelete = useCallback(() => {
    close();
    Alert.alert('删除碎片', '删除后无法恢复，确认要删除这条灵感吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          try {
            const deviceId = await getOrCreateDeviceId();
            await deleteLocalFragmentEntity(fragment.id, { deviceId });
            markFragmentsStale();
          } catch {
            Alert.alert('删除失败', '碎片删除失败，请重试');
          }
        },
      },
    ]);
  }, [close, fragment.id]);

  /*选择模式下直接渲染普通卡片，不附加滑动手势。*/
  if (selectable) {
    return (
      <FragmentCard
        fragment={fragment}
        onPress={onPress}
        selectable={selectable}
        selected={selected}
        isFirstInSection={isFirstInSection}
        isLastInSection={isLastInSection}
      />
    );
  }

  return (
    <>
      <View style={styles.container}>
        {/*操作按钮区：绝对定位在右侧，卡片左移时逐步露出。*/}
        <View style={[styles.actions, { width: ACTIONS_WIDTH }]}>
          <ActionButton
            icon="square.and.arrow.up"
            label="共享"
            color={theme.colors.primary}
            onPress={handleShare}
            isFirst
          />
          <ActionButton
            icon="folder"
            label="移动"
            color={theme.colors.success}
            onPress={handleMove}
          />
          <ActionButton
            icon="trash"
            label="删除"
            color={theme.colors.danger}
            onPress={handleDelete}
            isLast
            isLastInSection={isLastInSection}
          />
        </View>

        {/*卡片层：通过 PanResponder 响应左滑手势。*/}
        <Animated.View
          style={[styles.card, { transform: [{ translateX }] }]}
          {...panResponder.panHandlers}
        >
          <FragmentCard
            fragment={fragment}
            onPress={(f) => {
              /*卡片打开时点击先关闭，不跳页；关闭状态下正常跳转。*/
              if (isOpen.current) {
                close();
              } else {
                onPress?.(f);
              }
            }}
            isFirstInSection={isFirstInSection}
            isLastInSection={isLastInSection}
          />
        </Animated.View>
      </View>

      <MoveFolderModal
        currentFolderId={fragment.folder_id}
        visible={moveFolderVisible}
        onClose={() => setMoveFolderVisible(false)}
        onSelect={handleFolderSelect}
      />
    </>
  );
}

interface ActionButtonProps {
  icon: React.ComponentProps<typeof SymbolView>['name'];
  label: string;
  color: string;
  onPress: () => void;
  isFirst?: boolean;
  isLast?: boolean;
  isLastInSection?: boolean;
}

/*操作按钮：竖向排列图标和文字，点击高亮反馈。*/
function ActionButton({
  icon,
  label,
  color,
  onPress,
  isLast = false,
  isLastInSection = false,
}: ActionButtonProps) {
  return (
    <TouchableOpacity
      style={[
        styles.actionButton,
        { backgroundColor: color },
        isLast && isLastInSection ? styles.actionButtonLastInSection : null,
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <SymbolView name={icon} size={20} tintColor="#FFFFFF" />
      <Text style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
  },
  actions: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  actionButtonLastInSection: {
    borderBottomRightRadius: 18,
  },
  actionLabel: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  card: {
    width: '100%',
  },
});
