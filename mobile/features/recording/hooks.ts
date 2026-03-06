import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { Audio } from 'expo-av';
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
  fragment_id: string;
  audio_path: string;
  message: string;
}

export function useAudioRecorder() {
  const [status, setStatus] = useState<'idle' | 'recording' | 'recorded'>('idle');
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const configureAudioMode = async (recordingEnabled = true) => {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: recordingEnabled,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
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
    };
  }, []);

  const reset = () => {
    setRecordedUri(null);
    setDurationSeconds(0);
    setStatus('idle');
  };

  const startRecording = async () => {
    const { status: permissionStatus } = await Audio.requestPermissionsAsync();
    if (permissionStatus !== 'granted') {
      Alert.alert('需要麦克风权限', '请在设置中允许访问麦克风');
      return;
    }

    try {
      reset();
      const { recording: nextRecording } = await Audio.Recording.createAsync({
        android: {
          extension: '.m4a',
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
        },
        ios: {
          extension: '.m4a',
          audioQuality: Audio.IOSAudioQuality.HIGH,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
        web: {
          mimeType: 'audio/webm',
          bitsPerSecond: 128000,
        },
      });

      setRecording(nextRecording);
      setStatus('recording');
      durationTimerRef.current = setInterval(() => {
        setDurationSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('开始录音失败:', err);
      Alert.alert('录音失败', '无法开始录音，请重试');
    }
  };

  const stopRecording = async () => {
    if (!recording) return null;

    try {
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }

      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
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
      const { sound } = await Audio.Sound.createAsync({ uri: recordedUri });
      await sound.setVolumeAsync(1);
      await sound.playAsync();
      sound.setOnPlaybackStatusUpdate(async (playbackStatus) => {
        if (playbackStatus.isLoaded && playbackStatus.didJustFinish) {
          await sound.unloadAsync();
          await configureAudioMode(true);
        }
      });
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
    stopRecording,
    playRecording,
    reset,
  };
}

export function useAudioUpload() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = async (uri: string) => {
    if (!uri) return null;

    try {
      setStatus('loading');
      setError(null);
      setResult(null);
      const response = await uploadAudio<{
        fragment_id: string;
        audio_path: string;
        relative_path: string;
        file_size: number;
        message: string;
      }>(uri);
      const nextResult = {
        fragment_id: response.fragment_id,
        audio_path: response.audio_path,
        message: response.message,
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
