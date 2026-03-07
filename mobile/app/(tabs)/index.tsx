import React, { useCallback } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { Text } from '@/components/Themed';
import { RecorderControls } from '@/features/recording/components/RecorderControls';
import { RecordingStatusCard } from '@/features/recording/components/RecordingStatusCard';
import { useAudioRecorder, useAudioUpload } from '@/features/recording/hooks';
import {
  useDailyPushTrigger,
  useForceDailyPushTrigger,
  useTodayDailyPush,
} from '@/features/scripts/hooks';
import { useAppTheme } from '@/theme/useAppTheme';

export default function HomeScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const recorder = useAudioRecorder();
  const upload = useAudioUpload();
  const dailyPush = useTodayDailyPush();
  const dailyPushTrigger = useDailyPushTrigger();
  const forceDailyPushTrigger = useForceDailyPushTrigger();

  useFocusEffect(
    useCallback(() => {
      dailyPush.reload();
    }, [dailyPush.reload])
  );

  const handleToggleRecording = async () => {
    if (recorder.status === 'recording') {
      const uri = await recorder.stopRecording();
      if (!uri) return;

      try {
        const result = await upload.upload(uri);
        if (result) {
          Alert.alert('上传成功', '音频已上传，正在后台转写中...');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : '上传失败，请重试';
        Alert.alert('上传失败', message);
      }
      return;
    }

    upload.reset();
    await recorder.startRecording();
  };

  const handleRetryUpload = async () => {
    if (!recorder.recordedUri) return;

    try {
      await upload.upload(recorder.recordedUri);
    } catch {
      // Error state is already captured by the upload hook.
    }
  };

  const handleOpenTextNote = () => {
    router.push('/text-note');
  };

  const isUploading = upload.status === 'loading';

  const handleTriggerDailyPush = async () => {
    try {
      const script = await dailyPushTrigger.run();
      await dailyPush.reload();
      Alert.alert('生成成功', '今日灵感卡片已生成，可以直接查看。', [
        {
          text: '去看看',
          onPress: () => router.push(`/script/${script.id}`),
        },
        { text: '稍后' },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : '生成失败，请重试';
      Alert.alert('暂时无法生成', message);
    }
  };

  const handleForceTriggerDailyPush = async () => {
    try {
      const script = await forceDailyPushTrigger.run();
      await dailyPush.reload();
      Alert.alert('强制生成成功', '已忽略语义关联，直接生成今日灵感卡片。', [
        {
          text: '去看看',
          onPress: () => router.push(`/script/${script.id}`),
        },
        { text: '稍后' },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : '生成失败，请重试';
      Alert.alert('暂时无法强制生成', message);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.text }]}>灵感捕手</Text>
        <Text style={[styles.subtitle, { color: theme.colors.textSubtle }]}>说一段，或写一句，先把灵感留下来</Text>

        <Pressable
          style={[
            styles.textEntryButton,
            theme.shadow.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
          onPress={handleOpenTextNote}
        >
          <Text style={[styles.textEntryEyebrow, { color: theme.colors.primary }]}>写下来</Text>
          <Text style={[styles.textEntryTitle, { color: theme.colors.text }]}>不方便录音时，直接记一条灵感</Text>
          <Text style={[styles.textEntryHint, { color: theme.colors.textSubtle }]}>选题、金句、观察、提纲都可以先写下，保存后会和语音记录一起进入碎片库。</Text>
        </Pressable>
      </View>

      {dailyPush.script ? (
        <Pressable
          style={[
            styles.dailyPushCard,
            theme.shadow.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.warning,
            },
          ]}
          onPress={() => router.push(`/script/${dailyPush.script?.id}`)}
        >
          <Text style={[styles.dailyPushEyebrow, { color: theme.colors.warning }]}>每日灵感推盘</Text>
          <Text style={[styles.dailyPushTitle, { color: theme.colors.text }]}>昨天的 {dailyPush.script.source_fragment_count} 个灵感，已为您写成今日待拍脚本</Text>
          <Text style={[styles.dailyPushHint, { color: theme.colors.textSubtle }]}>点击查看口播稿，直接进入拍摄流程</Text>
        </Pressable>
      ) : (
        <View>
          <Pressable
            style={[
              styles.triggerCard,
              theme.shadow.card,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.primary,
                opacity:
                  dailyPushTrigger.status === 'loading' || forceDailyPushTrigger.status === 'loading'
                    ? 0.7
                    : 1,
              },
            ]}
            onPress={handleTriggerDailyPush}
            disabled={dailyPushTrigger.status === 'loading' || forceDailyPushTrigger.status === 'loading'}
          >
            <Text style={[styles.triggerTitle, { color: theme.colors.text }]}>立即生成今日灵感卡片</Text>
            <Text style={[styles.triggerHint, { color: theme.colors.textSubtle }]}>不等到明天，直接用今天已转写的碎片试生成一张待拍卡片</Text>
            <Text style={[styles.triggerAction, { color: theme.colors.primary }]}>{dailyPushTrigger.status === 'loading' ? '生成中...' : '点我立即生成'}</Text>
          </Pressable>
          <Pressable
            style={[
              styles.forceTriggerCard,
              theme.shadow.card,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.danger,
                opacity:
                  dailyPushTrigger.status === 'loading' || forceDailyPushTrigger.status === 'loading'
                    ? 0.7
                    : 1,
              },
            ]}
            onPress={handleForceTriggerDailyPush}
            disabled={dailyPushTrigger.status === 'loading' || forceDailyPushTrigger.status === 'loading'}
          >
            <Text style={[styles.forceTriggerTitle, { color: theme.colors.text }]}>强制生成，忽略语义关联</Text>
            <Text style={[styles.forceTriggerHint, { color: theme.colors.textSubtle }]}>只要今天有至少 3 条已转写碎片，就直接生成，不再判断它们是不是同一主题</Text>
            <Text style={[styles.forceTriggerAction, { color: theme.colors.danger }]}>{forceDailyPushTrigger.status === 'loading' ? '强制生成中...' : '立即强制生成'}</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.middleArea}>
        <RecordingStatusCard
          isUploading={isUploading}
          uploadStatus={upload.status}
          uploadResult={upload.result}
          uploadError={upload.error}
          recordedUri={recorder.recordedUri}
          onPlayRecording={recorder.playRecording}
          onRetryUpload={handleRetryUpload}
        />
      </View>

      <RecorderControls
        recorderStatus={recorder.status}
        durationLabel={recorder.durationLabel}
        isUploading={isUploading}
        hasRecording={Boolean(recorder.recordedUri)}
        onToggleRecording={handleToggleRecording}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    marginTop: 8,
  },
  textEntryButton: {
    marginTop: 18,
    width: '100%',
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
  middleArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  dailyPushCard: {
    marginTop: 20,
    marginHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  dailyPushEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  dailyPushTitle: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 26,
  },
  dailyPushHint: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 18,
  },
  triggerCard: {
    marginTop: 20,
    marginHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  triggerTitle: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
  },
  triggerHint: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
  },
  triggerAction: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '600',
  },
  forceTriggerCard: {
    marginTop: 12,
    marginHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  forceTriggerTitle: {
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 24,
  },
  forceTriggerHint: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
  },
  forceTriggerAction: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '600',
  },
});
