import React, { useCallback, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
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

function IconButton({
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
        styles.iconButton,
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
    if (hasAutoStartedRef.current) {
      return;
    }

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
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  const handleStop = async () => {
    await session.stopAndUpload(folderId);
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  const handlePauseToggle = () => {
    if (session.status === 'paused') {
      session.resume();
      return;
    }
    if (session.status === 'recording') {
      session.pause();
    }
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

      {/* 顶部导航栏 */}
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        <View style={styles.recRow}>
          {session.status === 'recording' && (
            <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.recDot} />
          )}
          <Text style={[styles.recText, { color: theme.colors.primary }]}>
            {session.status === 'paused' ? '已暂停' : 'REC'}
          </Text>
        </View>

        <View style={styles.topActions}>
          <SecondaryPill
            label="中英"
            symbol="globe"
            onPress={() => showPlaceholderAlert('语言选择即将接入')}
          />
          <IconButton
            symbol="xmark"
            onPress={() => void handleCancel()}
            size={44}
            color={theme.colors.text}
            backgroundColor={theme.colors.surface}
          />
        </View>
      </View>

      {/* 日期 */}
      <View style={styles.dateBlock}>
        <Text style={[styles.dateLabel, { color: theme.colors.text }]}>{formatTodayLabel()}</Text>
      </View>

      {/* 计时器 */}
      <View style={styles.timerWrap}>
        <View style={[styles.timerCard, theme.shadow.card, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.timerText, { color: theme.colors.text }]}>{session.durationLabel}</Text>
          <Text style={[styles.timerHint, { color: theme.colors.textSubtle }]}>
            {session.status === 'paused' ? '已暂停，点击继续' : '正在聆听你的想法'}
          </Text>
        </View>
      </View>

      {/* 主要操作按钮 */}
      <View style={styles.primaryActions}>
        <IconButton
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

        <IconButton
          symbol="flag.fill"
          onPress={() => showPlaceholderAlert('标记功能即将接入')}
          size={64}
          color={theme.colors.text}
          backgroundColor={theme.colors.surface}
        />
      </View>

      {/* 底部操作栏 */}
      <View style={[styles.bottomActions, { paddingBottom: insets.bottom + 20 }]}>
        <SecondaryPill
          label="笔记"
          symbol="square.and.pencil"
          onPress={handleOpenTextNote}
        />
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
    paddingHorizontal: 16,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
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
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dateBlock: {
    marginTop: 16,
    alignItems: 'flex-start',
  },
  dateLabel: {
    fontSize: 28,
    fontWeight: '700',
  },
  timerWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timerCard: {
    minWidth: 220,
    borderRadius: 24,
    paddingHorizontal: 32,
    paddingVertical: 28,
    alignItems: 'center',
    borderWidth: 1,
  },
  timerText: {
    fontSize: 56,
    fontWeight: '800',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  timerHint: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '500',
  },
  primaryActions: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  iconButton: {
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
  bottomActions: {
    marginTop: 32,
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
    borderWidth: 1,
  },
  secondaryPillText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
