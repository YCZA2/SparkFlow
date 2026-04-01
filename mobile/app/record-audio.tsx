import React, { useCallback, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { Text } from '@/components/Themed';
import { consumePendingFragmentCleanupDirectly } from '@/features/fragments/cleanup/runtime';
import { useAudioCaptureSession } from '@/features/recording/AudioCaptureProvider';
import { useAppTheme } from '@/theme/useAppTheme';

function formatTodayLabel() {
  const today = new Date();
  return `${today.getMonth() + 1}月${today.getDate()}日`;
}

/** 顶部圆形按钮，和首页/列表页 headerButton 保持同一视觉语言 */
function HeaderCircleButton({
  symbol,
  onPress,
  tintColor,
}: {
  symbol: React.ComponentProps<typeof SymbolView>['name'];
  onPress: () => void;
  tintColor: string;
}) {
  const theme = useAppTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={8}
      style={[
        styles.headerButton,
        {
          backgroundColor:
            theme.name === 'dark' ? theme.colors.surfaceMuted : 'rgba(255,255,255,0.9)',
          borderColor: theme.colors.border,
        },
      ]}
    >
      <SymbolView name={symbol} size={20} tintColor={tintColor} />
    </TouchableOpacity>
  );
}

/** 主操作区域的圆形按钮（暂停/播放/标记） */
function ActionButton({
  symbol,
  onPress,
  size = 56,
  color,
  backgroundColor,
}: {
  symbol: React.ComponentProps<typeof SymbolView>['name'];
  onPress: () => void;
  size?: number;
  color: string;
  backgroundColor: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor,
          opacity: pressed ? 0.72 : 1,
        },
      ]}
    >
      <SymbolView name={symbol} size={size * 0.45} tintColor={color} />
    </Pressable>
  );
}

/** 底部辅助操作胶囊按钮 */
function SecondaryPill({
  label,
  symbol,
  onPress,
}: {
  label: string;
  symbol: React.ComponentProps<typeof SymbolView>['name'];
  onPress: () => void;
}) {
  const theme = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryPill,
        theme.shadow.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          opacity: pressed ? 0.72 : 1,
        },
      ]}
    >
      <SymbolView name={symbol} size={20} tintColor={theme.colors.text} />
      <Text style={[styles.secondaryPillText, { color: theme.colors.text }]}>{label}</Text>
    </Pressable>
  );
}

export default function RecordAudioScreen() {
  const router = useRouter();
  const { folderId } = useLocalSearchParams<{ folderId?: string }>();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const session = useAudioCaptureSession();
  const hasAutoStartedRef = useRef(false);

  useEffect(() => {
    if (hasAutoStartedRef.current) return;
    hasAutoStartedRef.current = true;
    if (
      session.status !== 'recording' &&
      session.status !== 'paused' &&
      session.status !== 'uploading'
    ) {
      void session.start();
    }
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      void consumePendingFragmentCleanupDirectly().catch(() => {
        /*录音页兜底清理失败时保留 ticket，等待下次返回重试。 */
      });
    }, [])
  );

  const showPlaceholderAlert = (title: string) => {
    Alert.alert(title, '这个入口会在下一版接入，当前先保留视觉位置。');
  };

  const handleCancel = async () => {
    await session.cancel();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const handleStop = async () => {
    await session.stopAndUpload(folderId);
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const handlePauseToggle = () => {
    if (session.status === 'paused') {
      session.resume();
      return;
    }
    if (session.status === 'recording') session.pause();
  };

  const handleOpenTextNote = () => {
    router.push({
      pathname: '/text-note',
      params: {
        returnTo: '/record-audio',
        source: 'recording',
        ...(folderId && { folderId }),
      },
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />

      {/* 浮动顶栏：和首页/列表页统一的圆形按钮风格 */}
      <View style={[styles.floatingHeader, { top: insets.top + 12 }]}>
        <View style={styles.recRow}>
          {session.status === 'recording' && (
            <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.recDot} />
          )}
          <Text style={[styles.recText, { color: theme.colors.primary }]}>
            {session.status === 'paused' ? '已暂停' : 'REC'}
          </Text>
        </View>

        <View style={styles.headerRightActions}>
          <HeaderCircleButton
            symbol="globe"
            onPress={() => showPlaceholderAlert('语言选择即将接入')}
            tintColor={theme.colors.text}
          />
          <HeaderCircleButton
            symbol="xmark"
            onPress={() => void handleCancel()}
            tintColor={theme.colors.text}
          />
        </View>
      </View>

      {/* 页面标题区域：和列表页 Hero 块统一 */}
      <View style={[styles.heroBlock, { paddingTop: insets.top + 66 }]}>
        <Text style={[styles.heroTitle, { color: theme.colors.text }]}>{formatTodayLabel()}</Text>
        <Text style={[styles.heroSubtitle, { color: theme.colors.textSubtle }]}>
          {session.status === 'paused' ? '录音已暂停' : '正在聆听你的想法'}
        </Text>
      </View>

      {/* 计时器 */}
      <View style={styles.timerWrap}>
        <View
          style={[
            styles.timerCard,
            theme.shadow.card,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
        >
          <Text style={[styles.timerText, { color: theme.colors.text }]}>
            {session.durationLabel}
          </Text>
        </View>
      </View>

      {/* 主要操作按钮 */}
      <View style={styles.primaryActions}>
        <ActionButton
          symbol={session.status === 'paused' ? 'play.fill' : 'pause.fill'}
          onPress={handlePauseToggle}
          size={64}
          color={theme.colors.text}
          backgroundColor={theme.colors.surface}
        />

        <Pressable
          onPress={() => void handleStop()}
          disabled={session.status === 'uploading'}
          style={({ pressed }) => [
            styles.stopButton,
            theme.shadow.card,
            {
              backgroundColor: theme.colors.primary,
              opacity: pressed || session.status === 'uploading' ? 0.72 : 1,
            },
          ]}
        >
          {session.status === 'uploading' ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <View style={styles.stopSquare} />
          )}
        </Pressable>

        <ActionButton
          symbol="flag.fill"
          onPress={() => showPlaceholderAlert('标记功能即将接入')}
          size={64}
          color={theme.colors.text}
          backgroundColor={theme.colors.surface}
        />
      </View>

      {/* 底部操作栏 */}
      <View style={[styles.bottomActions, { paddingBottom: insets.bottom + 20 }]}>
        <SecondaryPill label="笔记" symbol="square.and.pencil" onPress={handleOpenTextNote} />
        <SecondaryPill
          label="相机"
          symbol="camera.fill"
          onPress={() => showPlaceholderAlert('相机联动即将接入')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  /* —— 浮动顶栏 —— */
  floatingHeader: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 60,
  },
  recDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF3B30',
  },
  recText: {
    fontSize: 15,
    fontWeight: '700',
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
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  /* —— Hero 区域 —— */
  heroBlock: {
    paddingHorizontal: 16,
    marginBottom: 4,
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
  /* —— 计时器 —— */
  timerWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  timerCard: {
    minWidth: 220,
    borderRadius: 18,
    paddingHorizontal: 32,
    paddingVertical: 28,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  timerText: {
    fontSize: 56,
    fontWeight: '800',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  /* —— 主操作 —— */
  primaryActions: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  actionButton: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopButton: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  stopSquare: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
  },
  /* —— 底部操作 —— */
  bottomActions: {
    marginTop: 32,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  secondaryPill: {
    flex: 1,
    height: 52,
    borderRadius: 999,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  secondaryPillText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
