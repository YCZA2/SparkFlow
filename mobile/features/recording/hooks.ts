import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import {
  createAudioPlayer,
  type AudioPlayer,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder as useExpoAudioRecorder,
} from 'expo-audio';
import { CameraType, CameraView } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';

import { ApiError } from '@/features/core/api/client';
import { uploadAudio } from '@/features/recording/api';
import { updateScriptStatus } from '@/features/scripts/api';

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

interface UploadResult {
  pipeline_run_id: string;
  fragment_id: string;
  audio_file_url: string | null;
  message: string;
}

export function useAudioRecorder() {
  const recorder = useExpoAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [status, setStatus] = useState<'idle' | 'recording' | 'paused' | 'recorded'>('idle');
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);

  const configureAudioMode = async (recordingEnabled = true) => {
    await setAudioModeAsync({
      allowsRecording: recordingEnabled,
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
      interruptionMode: 'duckOthers',
    });
  };

  useEffect(() => {
    configureAudioMode().catch((err) => {
      console.error('配置音频模式失败:', err);
    });

    return () => {
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
      }
      if (playerRef.current) {
        playerRef.current.remove();
        playerRef.current = null;
      }
    };
  }, []);

  const stopDurationTimer = () => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
  };

  const startDurationTimer = () => {
    stopDurationTimer();
    durationTimerRef.current = setInterval(() => {
      setDurationSeconds((prev) => prev + 1);
    }, 1000);
  };

  const reset = () => {
    stopDurationTimer();
    setRecordedUri(null);
    setDurationSeconds(0);
    setStatus('idle');
  };

  const startRecording = async () => {
    const { status: permissionStatus } = await requestRecordingPermissionsAsync();
    if (permissionStatus !== 'granted') {
      Alert.alert('需要麦克风权限', '请在设置中允许访问麦克风');
      return;
    }

    try {
      reset();
      await configureAudioMode(true);
      await recorder.prepareToRecordAsync();
      recorder.record();
      setStatus('recording');
      startDurationTimer();
    } catch (err) {
      console.error('开始录音失败:', err);
      Alert.alert('录音失败', '无法开始录音，请重试');
    }
  };

  const pauseRecording = () => {
    if (status !== 'recording') return;

    try {
      recorder.pause();
      stopDurationTimer();
      setStatus('paused');
    } catch (err) {
      console.error('暂停录音失败:', err);
      Alert.alert('暂停失败', '无法暂停录音，请重试');
    }
  };

  const resumeRecording = () => {
    if (status !== 'paused') return;

    try {
      recorder.record();
      setStatus('recording');
      startDurationTimer();
    } catch (err) {
      console.error('继续录音失败:', err);
      Alert.alert('继续失败', '无法继续录音，请重试');
    }
  };

  const stopRecording = async () => {
    if (status !== 'recording' && status !== 'paused') return null;

    try {
      stopDurationTimer();

      await recorder.stop();
      const uri = recorder.uri;
      if (uri) {
        setRecordedUri(uri);
        setStatus('recorded');
      } else {
        setStatus('idle');
      }
      return uri;
    } catch (err) {
      console.error('停止录音失败:', err);
      Alert.alert('停止失败', '无法停止录音');
      return null;
    }
  };

  const playRecording = async () => {
    if (!recordedUri) return;

    try {
      await configureAudioMode(false);
      if (playerRef.current) {
        playerRef.current.remove();
        playerRef.current = null;
      }

      const player = createAudioPlayer(recordedUri);
      playerRef.current = player;

      const subscription = player.addListener('playbackStatusUpdate', async (playbackStatus) => {
        if (playbackStatus.didJustFinish) {
          subscription.remove();
          player.remove();
          if (playerRef.current === player) {
            playerRef.current = null;
          }
          await configureAudioMode(true);
        }
      });
      player.play();
    } catch (err) {
      console.error('播放失败:', err);
      Alert.alert('播放失败', '无法播放录音');
      await configureAudioMode(true);
    }
  };

  return {
    status,
    recordedUri,
    durationSeconds,
    durationLabel: formatDuration(durationSeconds),
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    playRecording,
    reset,
  };
}

export function useAudioUpload() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = async (uri: string, folderId?: string) => {
    if (!uri) return null;

    try {
      setStatus('loading');
      setError(null);
      setResult(null);
      const response = await uploadAudio(uri, folderId);
      if (!response.fragment_id) {
        throw new Error('上传成功，但未返回 fragment_id');
      }
      const nextResult = {
        pipeline_run_id: response.pipeline_run_id,
        fragment_id: response.fragment_id,
        audio_file_url: response.audio_file_url,
        message: '已创建后台转写任务，可在任务状态中继续观察进度。',
      };
      setResult(nextResult);
      setStatus('success');
      return nextResult;
    } catch (err) {
      const message =
        err instanceof ApiError && err.code === 'NETWORK_ERROR'
          ? '网络不可用，请检查网络连接后重试'
          : err instanceof Error
            ? err.message
            : '上传失败，请重试';
      setError(message);
      setStatus('error');
      throw err;
    }
  };

  const reset = () => {
    setStatus('idle');
    setResult(null);
    setError(null);
  };

  return {
    status,
    result,
    error,
    upload,
    reset,
  };
}

export function useVideoRecorder(scriptId?: string) {
  const cameraRef = useRef<CameraView>(null);
  const [facing, setFacing] = useState<CameraType>('front');
  const [isRecording, setIsRecording] = useState(false);

  const toggleCameraFacing = useCallback(() => {
    if (isRecording) return;
    setFacing((current) => (current === 'back' ? 'front' : 'back'));
  }, [isRecording]);

  const saveVideoToLibrary = useCallback(async (videoUri: string): Promise<boolean> => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('权限不足', '需要相册访问权限才能保存视频，请在设置中开启。');
        return false;
      }

      await MediaLibrary.createAssetAsync(videoUri);
      return true;
    } catch (err) {
      console.error('[Shoot] 保存视频失败:', err);
      Alert.alert('保存失败', '视频保存到相册时出错，请重试。');
      return false;
    }
  }, []);

  const startRecording = useCallback(
    async (onFinished?: () => void) => {
      if (!cameraRef.current) return;

      try {
        setIsRecording(true);
        const video = await cameraRef.current.recordAsync({
          maxDuration: 600,
        });

        if (video?.uri) {
          const saved = await saveVideoToLibrary(video.uri);
          if (saved && scriptId) {
            try {
              await updateScriptStatus(scriptId, 'filmed');
            } catch (err) {
              console.error('[Shoot] 更新口播稿状态失败:', err);
            }
          }
          if (saved) {
            onFinished?.();
          }
        }
      } catch (err) {
        console.error('[Shoot] 录制失败:', err);
        Alert.alert('录制失败', '视频录制过程中出错，请重试。');
      } finally {
        setIsRecording(false);
      }
    },
    [saveVideoToLibrary, scriptId]
  );

  const stopRecording = useCallback(() => {
    if (!cameraRef.current) return;
    cameraRef.current.stopRecording();
    setIsRecording(false);
  }, []);

  return {
    cameraRef,
    facing,
    isRecording,
    toggleCameraFacing,
    startRecording,
    stopRecording,
  };
}
