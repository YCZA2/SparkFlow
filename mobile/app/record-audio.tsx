import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';

import { Text } from '@/components/Themed';
import { useAudioCaptureSession } from '@/features/recording/AudioCaptureProvider';

function formatTodayLabel() {
  const today = new Date();
  return `${today.getMonth() + 1}月${today.getDate()}日`;
}

function IconButton({
  symbol,
  onPress,
  size = 56,
  color,
  backgroundColor,
}: {
  symbol: React.ComponentProps<typeof SymbolView>['name'];
  onPress: () => void;
  size?: number;
  color: string;
  backgroundColor: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor,
          opacity: pressed ? 0.72 : 1,
        },
      ]}
    >
      <SymbolView name={symbol} size={size * 0.45} tintColor={color} />
    </Pressable>
  );
}

function SecondaryPill({
  label,
  symbol,
  onPress,
  themeColor,
}: {
  label: string;
  symbol: React.ComponentProps<typeof SymbolView>['name'];
  onPress: () => void;
  themeColor: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryPill,
        { opacity: pressed ? 0.72 : 1 },
      ]}
    >
      <SymbolView name={symbol} size={22} tintColor={themeColor} />
      <Text style={[styles.secondaryPillText, { color: themeColor }]}>{label}</Text>
    </Pressable>
  );
}

export default function RecordAudioScreen() {
  const router = useRouter();
  const session = useAudioCaptureSession();
  const hasAutoStartedRef = useRef(false);

  useEffect(() => {
    if (hasAutoStartedRef.current) {
      return;
    }

    hasAutoStartedRef.current = true;
    if (
      session.status !== 'recording' &&
      session.status !== 'paused' &&
      session.status !== 'uploading'
    ) {
      void session.start();
    }
  }, [session]);

  const showPlaceholderAlert = (title: string) => {
    Alert.alert(title, '这个入口会在下一版接入，当前先保留视觉位置。');
  };

  const handleCancel = async () => {
    await session.cancel();
    router.replace('/?refresh=true');
  };

  const handleStop = async () => {
    await session.stopAndUpload();
    router.replace('/?refresh=true');
  };

  const handlePauseToggle = () => {
    if (session.status === 'paused') {
      session.resume();
      return;
    }
    if (session.status === 'recording') {
      session.pause();
    }
  };

  const handleOpenTextNote = () => {
    router.push({
      pathname: '/text-note',
      params: { returnTo: '/record-audio', source: 'recording' },
    });
  };

  return (
    <SafeAreaView
      edges={['top', 'left', 'right', 'bottom']}
      style={[styles.safeArea, { backgroundColor: '#F3EFE6' }]}
    >
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />

      <View style={styles.container}>
        <View style={styles.topBar}>
          <View style={styles.recRow}>
            <View style={styles.recDot} />
            <Text style={[styles.recText, { color: '#FF5A1F' }]}>REC</Text>
          </View>

          <View style={styles.topActions}>
            <SecondaryPill
              label="中英..."
              symbol="globe"
              onPress={() => showPlaceholderAlert('语言选择即将接入')}
              themeColor="#141414"
            />
            <IconButton
              symbol="character.book.closed"
              onPress={() => showPlaceholderAlert('转写样式即将接入')}
              color="#141414"
              backgroundColor="#ECE7DD"
            />
            <IconButton
              symbol="circle.hexagongrid.fill"
              onPress={() => showPlaceholderAlert('录音标记即将接入')}
              color="#141414"
              backgroundColor="#ECE7DD"
            />
          </View>
        </View>

        <View style={styles.dateBlock}>
          <Text style={[styles.dateLabel, { color: '#222222' }]}>{formatTodayLabel()}</Text>
        </View>

        <View style={styles.timerWrap}>
          <View style={styles.timerCard}>
            <Text style={styles.timerText}>{session.durationLabel}</Text>
            <Text style={styles.timerHint}>
              {session.status === 'paused' ? '已暂停，随时继续' : '正在聆听你的想法'}
            </Text>
          </View>
        </View>

        <View style={styles.primaryActions}>
          <IconButton
            symbol="xmark"
            onPress={() => void handleCancel()}
            size={72}
            color="#111111"
            backgroundColor="rgba(255,255,255,0.92)"
          />
          <Pressable
            onPress={() => void handleStop()}
            disabled={session.status === 'uploading'}
            style={({ pressed }) => [
              styles.stopButton,
              {
                backgroundColor: 'rgba(255,255,255,0.94)',
                opacity: pressed || session.status === 'uploading' ? 0.72 : 1,
              },
            ]}
          >
            {session.status === 'uploading' ? (
              <ActivityIndicator size="small" color="#FF5A1F" />
            ) : (
              <View style={styles.stopSquare} />
            )}
          </Pressable>
          <IconButton
            symbol={session.status === 'paused' ? 'play.fill' : 'pause.fill'}
            onPress={handlePauseToggle}
            size={72}
            color="#111111"
            backgroundColor="rgba(255,255,255,0.92)"
          />
        </View>

        <View style={styles.bottomActions}>
          <SecondaryPill
            label="标记"
            symbol="flag.fill"
            onPress={() => showPlaceholderAlert('标记功能即将接入')}
            themeColor="#141414"
          />
          <Pressable
            onPress={handleOpenTextNote}
            style={({ pressed }) => [
              styles.noteButton,
              { opacity: pressed ? 0.72 : 1 },
            ]}
          >
            <Text style={styles.noteButtonText}>添加笔记</Text>
          </Pressable>
          <SecondaryPill
            label="相机"
            symbol="camera.fill"
            onPress={() => showPlaceholderAlert('相机联动即将接入')}
            themeColor="#141414"
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 18,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  recDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FF4E1A',
  },
  recText: {
    fontSize: 18,
    fontWeight: '800',
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dateBlock: {
    marginTop: 22,
    alignItems: 'flex-start',
  },
  dateLabel: {
    fontSize: 30,
    fontWeight: '800',
  },
  timerWrap: {
    flex: 1,
    minHeight: 320,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timerCard: {
    minWidth: 240,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.58)',
    paddingHorizontal: 28,
    paddingVertical: 34,
    alignItems: 'center',
  },
  timerText: {
    fontSize: 60,
    fontWeight: '800',
    color: '#111111',
    letterSpacing: -2,
  },
  timerHint: {
    marginTop: 10,
    fontSize: 15,
    fontWeight: '600',
    color: '#7C756A',
  },
  primaryActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  iconButton: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopButton: {
    width: 128,
    height: 128,
    borderRadius: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopSquare: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#FF5A1F',
  },
  bottomActions: {
    marginTop: 28,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
  },
  secondaryPill: {
    flex: 1,
    minHeight: 64,
    borderRadius: 24,
    backgroundColor: 'rgba(223, 218, 208, 0.72)',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
  },
  secondaryPillText: {
    fontSize: 16,
    fontWeight: '700',
  },
  noteButton: {
    flex: 1.2,
    minHeight: 64,
    borderRadius: 24,
    backgroundColor: 'rgba(223, 218, 208, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 22,
  },
  noteButtonText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#141414',
  },
});
