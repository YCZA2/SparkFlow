import React, { useCallback } from 'react';
import { ActivityIndicator, Alert, StyleSheet, TouchableOpacity, View, Text } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TeleprompterOverlay } from '@/components/TeleprompterOverlay';
import { useVideoRecorder } from '@/features/recording/hooks';
import { extractPlainTextFromHtml } from '@/features/editor/html';
import { useAppTheme } from '@/theme/useAppTheme';

const FALLBACK_TEXT =
  '今天我想聊一个很多人都在做、但很少人做对的主题：定位。' +
  '你会发现，很多账号不缺努力，也不缺更新频率，真正缺的是一句能让人记住你的话。' +
  '定位不是给自己贴标签，而是帮用户在三秒内理解你是谁、能提供什么价值。' +
  '如果你的内容什么都讲一点，用户就什么都记不住。' +
  '所以先问自己三个问题：你最擅长解决什么问题？你想吸引哪一类人？别人为什么要听你说？' +
  '把这三个问题想清楚，再回头做内容，你会发现选题、表达和转化都更顺。';

export default function ShootScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { script_id, fragment_id, body_html } = useLocalSearchParams<{
    script_id?: string;
    fragment_id?: string;
    body_html?: string;
  }>();
  const scriptId = typeof script_id === 'string' ? script_id : undefined;
  const fragmentId = typeof fragment_id === 'string' ? fragment_id : undefined;
  const bodyHtml = typeof body_html === 'string' ? body_html : '';
  const [permission, requestPermission] = useCameraPermissions();
  const recorder = useVideoRecorder({ scriptId, fragmentId });

  const handleClose = useCallback(() => {
    if (recorder.isRecording) return;
    router.back();
  }, [recorder.isRecording, router]);

  const handleRecordPress = useCallback(() => {
    if (recorder.isRecording) {
      recorder.stopRecording();
      return;
    }

    recorder.startRecording(() => {
      Alert.alert('保存成功', '视频已保存到系统相册', [
        {
          text: '继续拍摄',
          style: 'default',
        },
        {
          text: '返回',
          style: 'cancel',
          onPress: () => router.back(),
        },
      ]);
    });
  }, [recorder, router]);

  /* 权限检查中 */
  if (!permission) {
    return (
      <View style={[styles.permissionContainer, { backgroundColor: theme.colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={[styles.permissionDesc, { color: theme.colors.textSubtle }]}>
          正在检查相机权限...
        </Text>
      </View>
    );
  }

  /* 权限未授权：和列表页统一的 Hero 风格 */
  if (!permission.granted) {
    return (
      <View style={[styles.permissionContainer, { backgroundColor: theme.colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={[styles.permissionTitle, { color: theme.colors.text }]}>需要相机权限</Text>
        <Text style={[styles.permissionDesc, { color: theme.colors.textSubtle }]}>
          为了使用拍摄功能，请授权访问您的相机。
        </Text>
        <TouchableOpacity
          style={[styles.permissionButton, { backgroundColor: theme.colors.primary }]}
          onPress={requestPermission}
        >
          <Text style={styles.permissionButtonText}>授权相机访问</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backButton} onPress={handleClose}>
          <Text style={[styles.backButtonText, { color: theme.colors.textSubtle }]}>返回</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const teleprompterText = bodyHtml.trim()
    ? extractPlainTextFromHtml(bodyHtml)
    : FALLBACK_TEXT;

  return (
    <View style={styles.cameraContainer}>
      <Stack.Screen options={{ headerShown: false }} />

      <CameraView
        ref={recorder.cameraRef}
        style={styles.camera}
        facing={recorder.facing}
        mode="video"
        mirror={recorder.facing === 'front'}
      >
        <View style={styles.teleprompterWrapper}>
          <TeleprompterOverlay text={teleprompterText} />
        </View>

        {/* 顶部控制栏：圆形按钮，半透明暗底 */}
        <View style={[styles.topControls, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity
            style={[styles.cameraCircleButton, recorder.isRecording && styles.buttonDisabled]}
            onPress={handleClose}
            disabled={recorder.isRecording}
          >
            <Text style={styles.cameraButtonText}>✕</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.cameraCircleButton, recorder.isRecording && styles.buttonDisabled]}
            onPress={recorder.toggleCameraFacing}
            disabled={recorder.isRecording}
          >
            <Text style={styles.cameraButtonText}>↻</Text>
          </TouchableOpacity>
        </View>

        {/* 底部控制栏 */}
        <View style={[styles.bottomControls, { paddingBottom: insets.bottom + 20 }]}>
          {recorder.isRecording ? (
            <View style={styles.recordingIndicator}>
              <View style={styles.recordingDot} />
              <Text style={styles.recordingText}>录制中</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.recordButton, recorder.isRecording && styles.recordButtonActive]}
            onPress={handleRecordPress}
            activeOpacity={0.8}
          >
            <View
              style={[
                styles.recordButtonInner,
                recorder.isRecording && styles.recordButtonInnerActive,
              ]}
            />
          </TouchableOpacity>

          <Text style={styles.hintText}>
            {recorder.isRecording ? '点击停止录制' : '点击开始录制'}
          </Text>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  /* —— 权限页：和列表页统一的背景和排版 —— */
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 16,
  },
  permissionTitle: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.9,
    textAlign: 'center',
  },
  permissionDesc: {
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 20,
  },
  permissionButton: {
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
  backButton: {
    paddingVertical: 12,
  },
  backButtonText: {
    fontSize: 16,
  },
  /* —— 相机界面：保持沉浸式暗色 —— */
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000000',
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
    paddingBottom: 10,
  },
  cameraCircleButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  cameraButtonText: {
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
