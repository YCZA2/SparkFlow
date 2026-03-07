import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { useAudioRecorder, useAudioUpload } from '@/features/recording/hooks';
import {
  useDailyPushTrigger,
  useForceDailyPushTrigger,
  useTodayDailyPush,
} from '@/features/scripts/hooks';

export interface CaptureScreenState {
  title: string;
  subtitle: string;
  recorder: ReturnType<typeof useAudioRecorder>;
  upload: ReturnType<typeof useAudioUpload>;
  dailyPush: ReturnType<typeof useTodayDailyPush>;
  isBusy: boolean;
  primaryDailyActionLabel: string;
  secondaryDailyActionLabel: string;
  openTextNote: () => void;
  toggleRecording: () => Promise<void>;
  retryUpload: () => Promise<void>;
  openDailyScript: () => void;
  runDailyPush: () => Promise<void>;
  runForceDailyPush: () => Promise<void>;
}

export function useCaptureScreen(): CaptureScreenState {
  const router = useRouter();
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

  const toggleRecording = useCallback(async () => {
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
  }, [recorder, upload]);

  const retryUpload = useCallback(async () => {
    if (!recorder.recordedUri) return;

    try {
      await upload.upload(recorder.recordedUri);
    } catch {
      // upload hook already stores error state
    }
  }, [recorder.recordedUri, upload]);

  const openTextNote = useCallback(() => {
    router.push('/text-note');
  }, [router]);

  const openDailyScript = useCallback(() => {
    if (!dailyPush.script) return;
    router.push(`/script/${dailyPush.script.id}`);
  }, [dailyPush.script, router]);

  const runDailyPush = useCallback(async () => {
    try {
      const script = await dailyPushTrigger.run();
      await dailyPush.reload();
      Alert.alert('生成成功', '今日灵感卡片已生成，可以直接查看。', [
        { text: '去看看', onPress: () => router.push(`/script/${script.id}`) },
        { text: '稍后' },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : '生成失败，请重试';
      Alert.alert('暂时无法生成', message);
    }
  }, [dailyPush, dailyPushTrigger, router]);

  const runForceDailyPush = useCallback(async () => {
    try {
      const script = await forceDailyPushTrigger.run();
      await dailyPush.reload();
      Alert.alert('强制生成成功', '已忽略语义关联，直接生成今日灵感卡片。', [
        { text: '去看看', onPress: () => router.push(`/script/${script.id}`) },
        { text: '稍后' },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : '生成失败，请重试';
      Alert.alert('暂时无法强制生成', message);
    }
  }, [dailyPush, forceDailyPushTrigger, router]);

  return {
    title: '灵感捕手',
    subtitle: '先捕获，再整理，再把今天的灵感写成可拍内容。',
    recorder,
    upload,
    dailyPush,
    isBusy:
      upload.status === 'loading' ||
      dailyPushTrigger.status === 'loading' ||
      forceDailyPushTrigger.status === 'loading',
    primaryDailyActionLabel:
      dailyPushTrigger.status === 'loading' ? '生成中...' : '立即生成今日灵感卡片',
    secondaryDailyActionLabel:
      forceDailyPushTrigger.status === 'loading' ? '强制生成中...' : '强制生成',
    openTextNote,
    toggleRecording,
    retryUpload,
    openDailyScript,
    runDailyPush,
    runForceDailyPush,
  };
}
