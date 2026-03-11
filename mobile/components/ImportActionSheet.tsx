import React from 'react';
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/Themed';
import { useImportActionSheet } from '@/providers/ImportActionSheetProvider';
import { useAppTheme } from '@/theme/useAppTheme';

function ActionCard({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: React.ComponentProps<typeof SymbolView>['name'];
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  const theme = useAppTheme();

  return (
    <TouchableOpacity
      activeOpacity={0.82}
      onPress={onPress}
      style={[
        styles.actionCard,
        theme.shadow.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <View style={[styles.actionIcon, { backgroundColor: theme.colors.surfaceMuted }]}>
        <SymbolView name={icon} size={22} tintColor={theme.colors.primary} />
      </View>
      <View style={styles.actionBody}>
        <Text style={[styles.actionTitle, { color: theme.colors.text }]}>{title}</Text>
        <Text style={[styles.actionSubtitle, { color: theme.colors.textSubtle }]}>
          {subtitle}
        </Text>
      </View>
      <SymbolView name="chevron.right" size={18} tintColor={theme.colors.textSubtle} />
    </TouchableOpacity>
  );
}

/**
 展示底部导入操作抽屉，承接链接导入与文件占位入口。
 */
export function ImportActionSheet() {
  const router = useRouter();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { isOpen, folderId, close } = useImportActionSheet();

  const handleImportFile = React.useCallback(() => {
    close();
    Alert.alert('导入文件', '这个入口会在下一版接入，当前先保留位置。');
  }, [close]);

  const handleImportLink = React.useCallback(() => {
    close();
    const href = folderId
      ? ({ pathname: '/import-link', params: { folderId } } as never)
      : ('/import-link' as never);
    router.push(href);
  }, [close, folderId, router]);

  return (
    <Modal animationType="none" visible={isOpen} transparent statusBarTranslucent onRequestClose={close}>
      <View style={styles.modalRoot}>
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={StyleSheet.absoluteFill}>
          <Pressable style={styles.backdrop} onPress={close} />
        </Animated.View>

        <Animated.View
          entering={SlideInDown.duration(220)}
          exiting={SlideOutDown.duration(180)}
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.background,
              paddingBottom: insets.bottom + 20,
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: theme.colors.border }]} />
          <Text style={[styles.sheetTitle, { color: theme.colors.text }]}>导入灵感</Text>
          <Text style={[styles.sheetSubtitle, { color: theme.colors.textSubtle }]}>
            支持从外部内容继续沉淀到当前碎片库。
          </Text>

          <View style={styles.actions}>
            <ActionCard
              icon="doc.badge.plus"
              title="导入文件"
              subtitle="保留入口，本次先不接入真实上传"
              onPress={handleImportFile}
            />
            <ActionCard
              icon="link"
              title="导入链接"
              subtitle="当前仅支持抖音分享链接"
              onPress={handleImportLink}
            />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.28)',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 999,
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 24,
    fontWeight: '700',
  },
  sheetSubtitle: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    marginTop: 20,
    gap: 12,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  actionBody: {
    flex: 1,
    marginRight: 10,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  actionSubtitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
  },
});
