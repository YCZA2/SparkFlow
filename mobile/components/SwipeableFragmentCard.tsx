import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated as RNAnimated,
  Share,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { SymbolView } from 'expo-symbols';

import { FragmentCard } from '@/components/FragmentCard';
import { MoveFolderModal } from '@/components/MoveFolderModal';
import { getOrCreateDeviceId } from '@/features/auth/device';
import {
  deleteLocalFragmentEntity,
  updateLocalFragmentEntity,
} from '@/features/fragments/store';
import { markFragmentsStale } from '@/features/fragments/refreshSignal';
import { extractPlainTextFromHtml } from '@/features/editor/html';
import type { Fragment } from '@/types/fragment';

/** 单个操作按钮宽度 */
const ACTION_BUTTON_SIZE = 52;
/** 按钮间距 */
const ACTION_BUTTON_GAP = 8;
/** 操作按钮区域总宽度 */
const ACTIONS_WIDTH = ACTION_BUTTON_SIZE * 3 + ACTION_BUTTON_GAP * 2 + 8; // 8px right padding

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
  /** 当前卡片彻底关闭后通知父组件，同步页面级滑开状态。 */
  onSwipeClose?: (fragmentId: string) => void;
  /** 当前是否有其他卡片已滑开，用于强制关闭 */
  shouldClose?: boolean;
  /** 父组件发起"关闭当前所有滑开卡片"时递增，用于响应空白点击等关闭动作。 */
  closeRequestVersion?: number;
}

/**
 * 在 FragmentCard 基础上增加左滑操作区，暴露"共享、移动、删除"三个快捷操作。
 * 选择模式下左滑禁用，与多选交互互不干扰。
 * 使用 react-native-gesture-handler 的 Swipeable 实现更流畅的手势体验。
 */
export function SwipeableFragmentCard({
  fragment,
  onPress,
  selectable = false,
  selected = false,
  isFirstInSection = false,
  isLastInSection = false,
  onSwipeOpen,
  onSwipeClose,
  shouldClose,
  closeRequestVersion = 0,
}: SwipeableFragmentCardProps) {
  const swipeableRef = useRef<Swipeable>(null);
  const isSwipeOpenRef = useRef(false);
  const [moveFolderVisible, setMoveFolderVisible] = useState(false);

  /*shouldClose 为 true 时关闭本卡片（其他卡片滑开时触发）。*/
  useEffect(() => {
    if (shouldClose) {
      swipeableRef.current?.close();
    }
  }, [shouldClose]);

  /*响应父层的全局关闭请求，处理点击空白处等非卡片手势关闭场景。 */
  useEffect(() => {
    if (closeRequestVersion > 0 && isSwipeOpenRef.current) {
      swipeableRef.current?.close();
    }
  }, [closeRequestVersion]);

  /*共享：把碎片标题和摘要/正文纯文本分享到系统分享面板。*/
  const handleShare = useCallback(async () => {
    swipeableRef.current?.close();
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
  }, [fragment]);

  /*移动：打开文件夹选择弹框。*/
  const handleMove = useCallback(() => {
    swipeableRef.current?.close();
    setMoveFolderVisible(true);
  }, []);

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
    swipeableRef.current?.close();
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
  }, [fragment.id]);

  /*渲染右侧操作按钮区（iOS 备忘录风格：紧凑圆形胶囊）。*/
  const renderRightActions = useCallback(
    (_: RNAnimated.AnimatedInterpolation<number>, dragX: RNAnimated.AnimatedInterpolation<number>) => {
      // 按钮随滑出进度渐显（基于 dragX 的位置计算）
      const progress = dragX.interpolate({
        inputRange: [-ACTIONS_WIDTH, 0],
        outputRange: [1, 0],
        extrapolate: 'clamp',
      });

      const opacity = progress.interpolate({
        inputRange: [0, 0.3, 1],
        outputRange: [0, 0.8, 1],
        extrapolate: 'clamp',
      });

      const scale = progress.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0.8, 0.95, 1],
        extrapolate: 'clamp',
      });

      return (
        <View style={styles.actionsContainer}>
          {/*共享按钮 - 蓝色*/}
          <RNAnimated.View
            style={[
              styles.actionButton,
              { backgroundColor: '#007AFF', opacity, transform: [{ scale }] },
            ]}
          >
            <TouchableOpacity style={styles.actionButtonTouchable} onPress={handleShare} activeOpacity={0.8}>
              <SymbolView name="square.and.arrow.up" size={22} tintColor="#FFFFFF" />
            </TouchableOpacity>
          </RNAnimated.View>

          {/*移动按钮 - 紫色*/}
          <RNAnimated.View
            style={[
              styles.actionButton,
              { backgroundColor: '#AF52DE', opacity, transform: [{ scale }] },
            ]}
          >
            <TouchableOpacity style={styles.actionButtonTouchable} onPress={handleMove} activeOpacity={0.8}>
              <SymbolView name="folder" size={22} tintColor="#FFFFFF" />
            </TouchableOpacity>
          </RNAnimated.View>

          {/*删除按钮 - 红色*/}
          <RNAnimated.View
            style={[
              styles.actionButton,
              { backgroundColor: '#FF3B30', opacity, transform: [{ scale }] },
            ]}
          >
            <TouchableOpacity style={styles.actionButtonTouchable} onPress={handleDelete} activeOpacity={0.8}>
              <SymbolView name="trash" size={22} tintColor="#FFFFFF" />
            </TouchableOpacity>
          </RNAnimated.View>
        </View>
      );
    },
    [handleShare, handleMove, handleDelete]
  );

  /*处理滑开事件，通知父组件关闭其他卡片。*/
  const handleSwipeableOpen = useCallback(() => {
    isSwipeOpenRef.current = true;
    onSwipeOpen?.(fragment.id);
  }, [fragment.id, onSwipeOpen]);

  /*处理滑回关闭事件，避免父层残留旧的滑开状态。 */
  const handleSwipeableClose = useCallback(() => {
    if (!isSwipeOpenRef.current) {
      return;
    }
    isSwipeOpenRef.current = false;
    onSwipeClose?.(fragment.id);
  }, [fragment.id, onSwipeClose]);

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
      <Swipeable
        ref={swipeableRef}
        friction={2.5}
        leftThreshold={40}
        rightThreshold={40}
        overshootRight={false}
        onSwipeableOpen={handleSwipeableOpen}
        onSwipeableClose={handleSwipeableClose}
        renderRightActions={renderRightActions}
        containerStyle={styles.swipeableContainer}
      >
        <FragmentCard
          fragment={fragment}
          onPress={onPress}
          isFirstInSection={isFirstInSection}
          isLastInSection={isLastInSection}
        />
      </Swipeable>

      <MoveFolderModal
        currentFolderId={fragment.folder_id}
        visible={moveFolderVisible}
        onClose={() => setMoveFolderVisible(false)}
        onSelect={handleFolderSelect}
      />
    </>
  );
}

const styles = StyleSheet.create({
  swipeableContainer: {
    /*卡片自身已经带页面级横向边距，侧滑容器不要再额外收窄一层。 */
    marginHorizontal: 0,
  },
  actionsContainer: {
    width: ACTIONS_WIDTH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: ACTION_BUTTON_GAP,
    paddingRight: 4,
  },
  actionButton: {
    width: ACTION_BUTTON_SIZE,
    height: ACTION_BUTTON_SIZE,
    borderRadius: ACTION_BUTTON_SIZE / 2,
    overflow: 'hidden',
  },
  actionButtonTouchable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
