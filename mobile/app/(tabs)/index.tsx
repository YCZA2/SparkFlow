import { useState, useEffect, useRef } from 'react';
import { StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Audio } from 'expo-av';

import { Text, View } from '@/components/Themed';
import { uploadAudio, ApiError } from '@/utils/api';

/**
 * 首页 - 灵感捕手
 * 阶段 5.2：实现 expo-av 录音功能
 */
export default function HomeScreen() {
  // 录音状态
  const [isRecording, setIsRecording] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);

  // 上传状态
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    fragment_id: string;
    audio_path: string;
    message: string;
  } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // 用于计时器的 ref
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 组件挂载时配置音频模式
  useEffect(() => {
    configureAudioMode();
    return () => {
      // 清理计时器
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
      }
    };
  }, []);

  /**
   * 配置音频模式
   */
  const configureAudioMode = async () => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
    } catch (err) {
      console.error('配置音频模式失败:', err);
    }
  };

  /**
   * 请求麦克风权限
   */
  const requestPermissions = async (): Promise<boolean> => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      return status === 'granted';
    } catch (err) {
      console.error('请求权限失败:', err);
      return false;
    }
  };

  /**
   * 开始录音
   */
  const startRecording = async () => {
    // 如果正在上传，禁止开始新的录音（但允许开始新的录音与上传并行）
    // 根据阶段 5.4 要求：同一条录音在上传/转写过程中禁止再次提交
    // 但允许开始新的录音（并行录制不受限制）

    // 清除之前的状态
    setUploadResult(null);
    setUploadError(null);
    setRecordedUri(null);
    setRecordingDuration(0);

    // 请求权限
    const hasPermission = await requestPermissions();
    if (!hasPermission) {
      Alert.alert('需要麦克风权限', '请在设置中允许访问麦克风');
      return;
    }

    try {
      // 配置录音参数
      const recordingOptions: Audio.RecordingOptions = {
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
      };

      // 创建并开始录音
      const { recording: newRecording } = await Audio.Recording.createAsync(
        recordingOptions
      );

      setRecording(newRecording);
      setIsRecording(true);
      setRecordedUri(null);
      setRecordingDuration(0);

      // 启动计时器
      durationTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);

      console.log('✅ 录音开始');
    } catch (err) {
      console.error('开始录音失败:', err);
      Alert.alert('录音失败', '无法开始录音，请重试');
    }
  };

  /**
   * 停止录音
   */
  const stopRecording = async () => {
    if (!recording) return;

    try {
      // 停止计时器
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }

      // 停止并卸载录音
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();

      setRecording(null);
      setIsRecording(false);

      if (uri) {
        setRecordedUri(uri);
        console.log('✅ 录音完成，文件路径:', uri);
        console.log('⏱️ 录音时长:', formatDuration(recordingDuration));

        // 阶段 5.4：自动上传音频
        await handleUploadAudio(uri);
      }
    } catch (err) {
      console.error('停止录音失败:', err);
      Alert.alert('停止失败', '无法停止录音');
    }
  };

  /**
   * 上传音频文件
   * 阶段 5.4：录音结束后自动上传
   */
  const handleUploadAudio = async (uri: string) => {
    // 防止重复提交
    if (isUploading) {
      console.log('⚠️ 上传进行中，忽略重复请求');
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadResult(null);

    try {
      console.log('📤 开始上传音频...');
      const result = await uploadAudio<{
        fragment_id: string;
        audio_path: string;
        relative_path: string;
        file_size: number;
        message: string;
      }>(uri);

      console.log('✅ 上传成功:', result);
      setUploadResult({
        fragment_id: result.fragment_id,
        audio_path: result.audio_path,
        message: result.message,
      });

      // 显示成功提示
      Alert.alert(
        '上传成功',
        '音频已上传，正在后台转写中...',
        [{ text: '确定', style: 'default' }]
      );
    } catch (error) {
      console.error('❌ 上传失败:', error);

      let errorMessage = '上传失败，请重试';
      if (error instanceof ApiError) {
        errorMessage = error.message;
        // 网络错误特殊提示
        if (error.code === 'NETWORK_ERROR') {
          errorMessage = '网络不可用，请检查网络连接后重试';
        }
      }

      setUploadError(errorMessage);
      Alert.alert('上传失败', errorMessage, [{ text: '确定', style: 'default' }]);
    } finally {
      setIsUploading(false);
    }
  };

  /**
   * 切换录音状态
   */
  const toggleRecording = async () => {
    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  };

  /**
   * 格式化时长显示
   */
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  /**
   * 根据录音状态获取状态提示文本
   */
  const getStatusText = (): string => {
    if (isRecording) {
      return `正在录音… ${formatDuration(recordingDuration)}`;
    }
    if (recordedUri) {
      return `录音完成 (${formatDuration(recordingDuration)})`;
    }
    return '点击开始录音';
  };

  /**
   * 根据录音状态获取按钮文本
   */
  const getButtonText = (): string => {
    return isRecording ? '停止录音' : '开始录音';
  };

  /**
   * 播放录音
   */
  const playRecording = async () => {
    if (!recordedUri) return;

    try {
      const { sound } = await Audio.Sound.createAsync({ uri: recordedUri });
      await sound.playAsync();
      console.log('▶️ 开始播放录音');

      // 播放结束后卸载
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync();
          console.log('⏹️ 播放结束');
        }
      });
    } catch (err) {
      console.error('播放失败:', err);
      Alert.alert('播放失败', '无法播放录音');
    }
  };

  return (
    <View style={styles.container}>
      {/* 顶部标题区域 */}
      <View style={styles.header}>
        <Text style={styles.title}>灵感捕手</Text>
        <Text style={styles.subtitle}>随时记录你的灵感碎片</Text>
      </View>

      {/* 中间区域 - 显示录音状态、上传状态或最近录音 */}
      <View style={styles.middleArea}>
        {/* 上传中状态 */}
        {isUploading && (
          <View style={styles.statusCard}>
            <ActivityIndicator size="large" color="#FF6B6B" />
            <Text style={styles.statusText}>正在上传音频...</Text>
            <Text style={styles.statusSubtext}>请稍候</Text>
          </View>
        )}

        {/* 上传成功状态 */}
        {!isUploading && uploadResult && (
          <View style={[styles.statusCard, styles.successCard]}>
            <Text style={styles.successIcon}>✓</Text>
            <Text style={styles.successText}>上传成功</Text>
            <Text style={styles.statusSubtext}>{uploadResult.message}</Text>
            <TouchableOpacity
              style={styles.playButton}
              onPress={playRecording}
              activeOpacity={0.8}
            >
              <Text style={styles.playButtonText}>▶ 播放录音</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 上传失败状态 */}
        {!isUploading && uploadError && (
          <View style={[styles.statusCard, styles.errorCard]}>
            <Text style={styles.errorIcon}>✗</Text>
            <Text style={styles.errorText}>上传失败</Text>
            <Text style={styles.statusSubtext}>{uploadError}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => recordedUri && handleUploadAudio(recordedUri)}
              activeOpacity={0.8}
            >
              <Text style={styles.retryButtonText}>重新上传</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 录音完成但未上传（初始状态） */}
        {recordedUri && !isUploading && !uploadResult && !uploadError && (
          <View style={styles.recordedInfo}>
            <Text style={styles.recordedLabel}>录音完成，准备上传...</Text>
            <Text style={styles.recordedPath} numberOfLines={2}>
              {recordedUri}
            </Text>
          </View>
        )}
      </View>

      {/* 底部录音按钮区域 */}
      <View style={styles.recorderContainer}>
        {/* 录音状态提示 */}
        <Text style={[styles.statusText, isRecording && styles.statusTextActive]}>
          {getStatusText()}
        </Text>

        {/* 大圆形录音按钮 */}
        <TouchableOpacity
          style={[
            styles.recordButton,
            isRecording && styles.recordButtonActive,
            isUploading && styles.recordButtonDisabled,
          ]}
          onPress={toggleRecording}
          activeOpacity={0.8}
          disabled={isUploading}
        >
          {isUploading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.recordButtonText}>
              {getButtonText()}
            </Text>
          )}
        </TouchableOpacity>

        {/* 底部提示 */}
        <Text style={styles.hintText}>
          {isUploading
            ? '正在上传音频，请稍候...'
            : isRecording
            ? '再次点击结束录音'
            : recordedUri
            ? '录音已保存，等待上传'
            : '点击按钮开始录音'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },
  middleArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  recordedInfo: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  recordedLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  recordedPath: {
    fontSize: 12,
    color: '#333',
    fontFamily: 'monospace',
  },
  recorderContainer: {
    alignItems: 'center',
    paddingBottom: 80,
    paddingHorizontal: 20,
  },
  statusText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
    fontWeight: '500',
  },
  statusTextActive: {
    color: '#FF4757',
  },
  recordButton: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#FF6B6B',
    justifyContent: 'center',
    alignItems: 'center',
    // 阴影效果
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  recordButtonActive: {
    backgroundColor: '#FF4757',
    // 录音中的阴影更强
    shadowColor: '#FF4757',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 12,
  },
  recordButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  hintText: {
    fontSize: 12,
    color: '#999',
    marginTop: 16,
  },
  playButton: {
    backgroundColor: '#4ECDC4',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 12,
    alignItems: 'center',
  },
  playButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  // 上传状态卡片样式
  statusCard: {
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    width: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  successCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#4ECDC4',
  },
  errorCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#FF4757',
  },
  successIcon: {
    fontSize: 48,
    color: '#4ECDC4',
    marginBottom: 8,
  },
  errorIcon: {
    fontSize: 48,
    color: '#FF4757',
    marginBottom: 8,
  },
  successText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4ECDC4',
    marginBottom: 4,
  },
  errorText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FF4757',
    marginBottom: 4,
  },
  statusSubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 4,
  },
  retryButton: {
    backgroundColor: '#FF6B6B',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 16,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  recordButtonDisabled: {
    backgroundColor: '#ccc',
  },
});
