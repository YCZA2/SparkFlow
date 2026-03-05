import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { TeleprompterOverlay } from '@/components/TeleprompterOverlay';

// 默认提词器文本（用于测试）
const FALLBACK_TEXT =
  '今天我想聊一个很多人都在做、但很少人做对的主题：定位。' +
  '你会发现，很多账号不缺努力，也不缺更新频率，真正缺的是一句能让人记住你的话。' +
  '定位不是给自己贴标签，而是帮用户在三秒内理解你是谁、能提供什么价值。' +
  '如果你的内容什么都讲一点，用户就什么都记不住。' +
  '所以先问自己三个问题：你最擅长解决什么问题？你想吸引哪一类人？别人为什么要听你说？' +
  '把这三个问题想清楚，再回头做内容，你会发现选题、表达和转化都更顺。';

/**
 * 拍摄页面 - 阶段 10.3 视频录制功能
 * 功能：
 * - 使用 expo-camera 实现相机预览
 * - 默认前置摄像头，可切换
 * - 叠加提词器组件
 * - 开始/停止录制按钮
 */
export default function ShootScreen() {
  const router = useRouter();
  const { script_id, content } = useLocalSearchParams<{
    script_id?: string;
    content?: string;
  }>();

  // 相机权限
  const [permission, requestPermission] = useCameraPermissions();
  // 摄像头方向：默认前置
  const [facing, setFacing] = useState<CameraType>('front');
  // 相机引用（用于录制）
  const cameraRef = useRef<CameraView>(null);
  // 录制状态
  const [isRecording, setIsRecording] = useState(false);

  // 切换前后摄像头
  const toggleCameraFacing = useCallback(() => {
    // 录制中不允许切换摄像头
    if (isRecording) return;
    setFacing((current) => (current === 'back' ? 'front' : 'back'));
  }, [isRecording]);

  // 关闭按钮
  const handleClose = useCallback(() => {
    // 录制中不允许关闭
    if (isRecording) return;
    router.back();
  }, [router, isRecording]);

  /**
   * 开始录制视频
   */
  const startRecording = useCallback(async () => {
    if (!cameraRef.current) return;

    try {
      setIsRecording(true);
      // 开始录制，设置最大时长为 10 分钟
      const video = await cameraRef.current.recordAsync({
        maxDuration: 600, // 10 分钟
      });

      // 录制完成，video.uri 是视频文件路径
      if (video?.uri) {
        console.log('[Shoot] 录制完成:', video.uri);
        // 阶段 10.4 会在这里保存到相册
        // TODO: 保存视频到相册
        // TODO: 更新口播稿状态
      }

      setIsRecording(false);
    } catch (error) {
      console.error('[Shoot] 录制失败:', error);
      setIsRecording(false);
    }
  }, []);

  /**
   * 停止录制视频
   */
  const stopRecording = useCallback(() => {
    if (!cameraRef.current) return;

    cameraRef.current.stopRecording();
    setIsRecording(false);
  }, []);

  // 录制按钮点击
  const handleRecordPress = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  // 权限加载中
  if (!permission) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FFFFFF" />
        <Text style={styles.loadingText}>正在检查相机权限...</Text>
      </View>
    );
  }

  // 未授权
  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Stack.Screen options={{ title: '相机权限' }} />
        <Text style={styles.permissionTitle}>需要相机权限</Text>
        <Text style={styles.permissionDesc}>
          为了使用拍摄功能，请授权访问您的相机。
        </Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>授权相机访问</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
          <Text style={styles.closeButtonText}>返回</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // 相机预览界面
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* 相机预览 - 全屏 */}
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        mode="video"
        mirror={facing === 'front'}
      >
        {/* 提词器叠加层 - 上半部分 */}
        <View style={styles.teleprompterWrapper}>
          <TeleprompterOverlay text={content?.trim() ? content : FALLBACK_TEXT} />
        </View>

        {/* 顶部控制栏 */}
        <View style={styles.topControls}>
          {/* 关闭按钮 */}
          <TouchableOpacity
            style={[styles.iconButton, isRecording && styles.iconButtonDisabled]}
            onPress={handleClose}
            disabled={isRecording}
          >
            <Text style={styles.iconButtonText}>✕</Text>
          </TouchableOpacity>

          {/* 切换摄像头按钮 */}
          <TouchableOpacity
            style={[styles.iconButton, isRecording && styles.iconButtonDisabled]}
            onPress={toggleCameraFacing}
            disabled={isRecording}
          >
            <Text style={styles.iconButtonText}>↻</Text>
          </TouchableOpacity>
        </View>

        {/* 底部控制栏 - 录制按钮 */}
        <View style={styles.bottomControls}>
          {/* 录制时长提示 */}
          {isRecording && (
            <View style={styles.recordingIndicator}>
              <View style={styles.recordingDot} />
              <Text style={styles.recordingText}>录制中</Text>
            </View>
          )}

          {/* 录制按钮 */}
          <TouchableOpacity
            style={[
              styles.recordButton,
              isRecording && styles.recordButtonActive,
            ]}
            onPress={handleRecordPress}
            activeOpacity={0.8}
          >
            <View style={[styles.recordButtonInner, isRecording && styles.recordButtonInnerActive]} />
          </TouchableOpacity>

          {/* 提示文字 */}
          <Text style={styles.hintText}>
            {isRecording ? '点击停止录制' : '点击开始录制'}
          </Text>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: '#1C1C1E',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 16,
  },
  permissionTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  permissionDesc: {
    color: '#8E8E93',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  permissionButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
  },
  permissionButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  closeButton: {
    paddingVertical: 12,
  },
  closeButtonText: {
    color: '#8E8E93',
    fontSize: 16,
  },
  camera: {
    flex: 1,
  },
  teleprompterWrapper: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 100,
    height: '30%',
  },
  topControls: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 10,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconButtonDisabled: {
    opacity: 0.5,
  },
  iconButtonText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
  },
  bottomControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingBottom: 50,
    paddingTop: 20,
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 59, 48, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 16,
    gap: 6,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  recordingText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'transparent',
    borderWidth: 4,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordButtonActive: {
    borderColor: '#FF3B30',
  },
  recordButtonInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FF3B30',
  },
  recordButtonInnerActive: {
    width: 32,
    height: 32,
    borderRadius: 6,
  },
  hintText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
    marginTop: 12,
  },
});