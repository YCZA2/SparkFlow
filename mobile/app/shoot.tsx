import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
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
 * 拍摄页面 - 阶段 10.1 基础相机预览
 * 功能：
 * - 使用 expo-camera 实现相机预览
 * - 默认前置摄像头
 * - 可切换前置/后置摄像头
 * - 叠加提词器组件（为阶段 10.2 准备）
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
  // 相机引用（用于后续录制功能）
  const cameraRef = useRef<CameraView>(null);

  // 切换前后摄像头
  const toggleCameraFacing = useCallback(() => {
    setFacing((current) => (current === 'back' ? 'front' : 'back'));
  }, []);

  // 关闭按钮
  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

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
        mode="video" // 为录制功能准备
        mirror={facing === 'front'} // 前置摄像头镜像
      >
        {/* 提词器叠加层 - 上半部分 */}
        <View style={styles.teleprompterWrapper}>
          <TeleprompterOverlay text={content?.trim() ? content : FALLBACK_TEXT} />
        </View>

        {/* 顶部控制栏 */}
        <View style={styles.topControls}>
          {/* 关闭按钮 */}
          <TouchableOpacity style={styles.iconButton} onPress={handleClose}>
            <Text style={styles.iconButtonText}>✕</Text>
          </TouchableOpacity>

          {/* 切换摄像头按钮 */}
          <TouchableOpacity style={styles.iconButton} onPress={toggleCameraFacing}>
            <Text style={styles.iconButtonText}>↻</Text>
          </TouchableOpacity>
        </View>

        {/* 底部控制栏（阶段 10.3 会添加录制按钮） */}
        <View style={styles.bottomControls}>
          <View style={styles.placeholderRecordButton}>
            <Text style={styles.placeholderText}>录制功能即将上线</Text>
          </View>
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
    top: 100, // 避开顶部状态栏和控制按钮
    height: '30%', // 提词器占屏幕上部 30%
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
    paddingTop: 50, // 避开状态栏
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
    paddingBottom: 40,
    paddingTop: 20,
  },
  placeholderRecordButton: {
    backgroundColor: 'rgba(255, 59, 48, 0.3)',
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  placeholderText: {
    color: '#FFFFFF',
    fontSize: 10,
    textAlign: 'center',
    fontWeight: '600',
  },
});