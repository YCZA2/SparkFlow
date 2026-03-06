import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { CameraType, CameraView } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';
import { updateScriptStatus } from '@/features/scripts/api';

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
