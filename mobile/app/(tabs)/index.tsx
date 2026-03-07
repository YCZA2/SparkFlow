import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BottomActionBar } from '@/components/layout/BottomActionBar';
import { ScreenContainer } from '@/components/layout/ScreenContainer';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Text } from '@/components/Themed';
import { RecordingStatusCard } from '@/features/recording/components/RecordingStatusCard';
import { RecorderControls } from '@/features/recording/components/RecorderControls';
import { useCaptureScreen } from '@/features/capture/useCaptureScreen';
import { useAppTheme } from '@/theme/useAppTheme';

export default function HomeScreen() {
  const theme = useAppTheme();
  const screen = useCaptureScreen();

  return (
    <ScreenContainer
      contentContainerStyle={styles.container}
      footer={
        <BottomActionBar>
          <RecorderControls
            recorderStatus={screen.recorder.status}
            durationLabel={screen.recorder.durationLabel}
            isUploading={screen.upload.status === 'loading'}
            hasRecording={Boolean(screen.recorder.recordedUri)}
            onToggleRecording={screen.toggleRecording}
          />
        </BottomActionBar>
      }
      includeBottomInset
      padded
      scrollable
    >
      <ScreenHeader
        eyebrow="捕获"
        title={screen.title}
        subtitle={screen.subtitle}
      />

      <View style={styles.section}>
        <Pressable
          style={[
            styles.textEntryButton,
            theme.shadow.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
          onPress={screen.openTextNote}
        >
          <Text style={[styles.textEntryEyebrow, { color: theme.colors.primary }]}>写下来</Text>
          <Text style={[styles.textEntryTitle, { color: theme.colors.text }]}>
            不方便录音时，直接记一条灵感
          </Text>
          <Text style={[styles.textEntryHint, { color: theme.colors.textSubtle }]}>
            选题、金句、观察、提纲都可以先写下，保存后会和语音记录一起进入碎片库。
          </Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>当日状态</Text>
        <RecordingStatusCard
          isUploading={screen.upload.status === 'loading'}
          uploadStatus={screen.upload.status}
          uploadResult={screen.upload.result}
          uploadError={screen.upload.error}
          recordedUri={screen.recorder.recordedUri}
          onPlayRecording={screen.recorder.playRecording}
          onRetryUpload={screen.retryUpload}
        />
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>今日行动</Text>
        {screen.dailyPush.script ? (
          <Pressable
            style={[
              styles.dailyPushCard,
              theme.shadow.card,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.warning,
              },
            ]}
            onPress={screen.openDailyScript}
          >
            <Text style={[styles.dailyPushEyebrow, { color: theme.colors.warning }]}>
              每日灵感推盘
            </Text>
            <Text style={[styles.dailyPushTitle, { color: theme.colors.text }]}>
              昨天的 {screen.dailyPush.script.source_fragment_count} 个灵感，已为你整理成今日待拍脚本
            </Text>
            <Text style={[styles.dailyPushHint, { color: theme.colors.textSubtle }]}>
              点击查看口播稿，直接进入拍摄流程
            </Text>
          </Pressable>
        ) : (
          <View
            style={[
              styles.dailyPushCard,
              theme.shadow.card,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <Text style={[styles.dailyPushEyebrow, { color: theme.colors.primary }]}>今日灵感卡片</Text>
            <Text style={[styles.dailyPushTitle, { color: theme.colors.text }]}>
              用今天已转写的碎片，直接生成一张待拍脚本
            </Text>
            <Text style={[styles.dailyPushHint, { color: theme.colors.textSubtle }]}>
              主操作会按语义关联生成；次操作会忽略主题关联直接尝试。
            </Text>

            <View style={styles.dailyActions}>
              <Pressable
                style={[
                  styles.primaryAction,
                  {
                    backgroundColor: theme.colors.primary,
                    opacity: screen.isBusy ? 0.7 : 1,
                  },
                ]}
                onPress={screen.runDailyPush}
                disabled={screen.isBusy}
              >
                <Text style={styles.primaryActionText}>{screen.primaryDailyActionLabel}</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.secondaryAction,
                  {
                    backgroundColor: theme.colors.surfaceMuted,
                    opacity: screen.isBusy ? 0.7 : 1,
                  },
                ]}
                onPress={screen.runForceDailyPush}
                disabled={screen.isBusy}
              >
                <Text style={[styles.secondaryActionText, { color: theme.colors.danger }]}>
                  {screen.secondaryDailyActionLabel}
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>

    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 24,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  textEntryButton: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  textEntryEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  textEntryTitle: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
  },
  textEntryHint: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
  },
  dailyPushCard: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  dailyPushEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  dailyPushTitle: {
    marginTop: 8,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
  },
  dailyPushHint: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
  },
  dailyActions: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 10,
  },
  primaryAction: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryAction: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
