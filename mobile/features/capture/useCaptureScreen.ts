import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { useAudioCaptureSession } from '@/features/recording/AudioCaptureProvider';
import {
  useDailyPushTrigger,
  useForceDailyPushTrigger,
  useTodayDailyPush,
} from '@/features/scripts/hooks';

export interface CaptureScreenState {
  title: string;
  subtitle: string;
  dailyPush: ReturnType<typeof useTodayDailyPush>;
  isBusy: boolean;
  primaryDailyActionLabel: string;
  secondaryDailyActionLabel: string;
  recorderStatus: ReturnType<typeof useAudioCaptureSession>['status'];
  recordedUri: string | null;
  uploadStatus: ReturnType<typeof useAudioCaptureSession>['uploadStatus'];
  uploadResult: ReturnType<typeof useAudioCaptureSession>['uploadResult'];
  uploadError: string | null;
  isUploading: boolean;
  playRecording: () => Promise<void>;
  retryUpload: () => Promise<void>;
  openDailyScript: () => void;
  runDailyPush: () => Promise<void>;
  runForceDailyPush: () => Promise<void>;
}

export function useCaptureScreen(): CaptureScreenState {
  const router = useRouter();
  const captureSession = useAudioCaptureSession();
  const dailyPush = useTodayDailyPush();
  const dailyPushTrigger = useDailyPushTrigger();
  const forceDailyPushTrigger = useForceDailyPushTrigger();

  useFocusEffect(
    useCallback(() => {
      dailyPush.reload();
    }, [dailyPush.reload])
  );

  const retryUpload = useCallback(async () => {
    await captureSession.retryUpload();
  }, [captureSession]);

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
    dailyPush,
    isBusy:
      captureSession.isUploading ||
      dailyPushTrigger.status === 'loading' ||
      forceDailyPushTrigger.status === 'loading',
    primaryDailyActionLabel:
      dailyPushTrigger.status === 'loading' ? '生成中...' : '立即生成今日灵感卡片',
    secondaryDailyActionLabel:
      forceDailyPushTrigger.status === 'loading' ? '强制生成中...' : '强制生成',
    recorderStatus: captureSession.status,
    recordedUri: captureSession.recordedUri,
    uploadStatus: captureSession.uploadStatus,
    uploadResult: captureSession.uploadResult,
    uploadError: captureSession.uploadError,
    isUploading: captureSession.isUploading,
    playRecording: captureSession.playRecording,
    retryUpload,
    openDailyScript,
    runDailyPush,
    runForceDailyPush,
  };
}
