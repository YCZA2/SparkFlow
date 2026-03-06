import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { Audio } from 'expo-av';

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
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
