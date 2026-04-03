import React, { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, Alert, Pressable, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { Text } from '@/components/Themed';
import { consumePendingFragmentCleanupDirectly } from '@/features/fragments/cleanup/runtime';
import { useAudioCaptureSession } from '@/features/recording/AudioCaptureProvider';
import { useAppTheme } from '@/theme/useAppTheme';

import { ActionButton, HeaderCircleButton, SecondaryPill } from './RecordAudioScreenControls';
import { recordAudioStyles as styles } from './recordAudioStyles';

/*格式化录音页当天标题，保持和设计稿里的日期表达一致。 */
function formatTodayLabel() {
  const today = new Date();
  return `${today.getMonth() + 1}月${today.getDate()}日`;
}

/*承接录音页交互和布局，让 route 文件只负责参数接入。 */
export function RecordAudioScreen({ folderId }: { folderId?: string }) {
  const router = useRouter();
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

  /*展示尚未接入的辅助入口提示，避免用户误以为功能失效。 */
  function showPlaceholderAlert(title: string) {
    Alert.alert(title, '这个入口会在下一版接入，当前先保留视觉位置。');
  }

  /*取消录音并回到上一个页面，兜底回首页。 */
  async function handleCancel() {
    await session.cancel();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  /*停止录音并触发上传，然后回到来源页面。 */
  async function handleStop() {
    await session.stopAndUpload(folderId);
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  /*在暂停与继续之间切换录音状态。 */
  function handlePauseToggle() {
    if (session.status === 'paused') {
      session.resume();
      return;
    }
    if (session.status === 'recording') session.pause();
  }

  /*打开文字笔记入口，并把当前录音页作为返回点。 */
  function handleOpenTextNote() {
    router.push({
      pathname: '/text-note',
      params: {
        returnTo: '/record-audio',
        source: 'recording',
        ...(folderId && { folderId }),
      },
    });
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
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

      <View style={[styles.heroBlock, { paddingTop: insets.top + 66 }]}>
        <Text style={[styles.heroTitle, { color: theme.colors.text }]}>{formatTodayLabel()}</Text>
        <Text style={[styles.heroSubtitle, { color: theme.colors.textSubtle }]}>
          {session.status === 'paused' ? '录音已暂停' : '正在聆听你的想法'}
        </Text>
      </View>

      <View style={styles.timerWrap}>
        <View
          style={[
            styles.timerCard,
            theme.shadow.card,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
        >
          <Text style={[styles.timerText, { color: theme.colors.text }]}>{session.durationLabel}</Text>
        </View>
      </View>

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
