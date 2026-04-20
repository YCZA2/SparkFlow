import React from 'react';
import { Modal, Pressable, TouchableOpacity, View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
      className="flex-row items-center rounded-[22px] border bg-app-surface p-sf-lg dark:bg-app-surface-dark"
      style={[
        theme.shadow.card,
        {
          borderColor: theme.colors.border,
        },
      ]}
    >
      <View className="mr-[14px] h-11 w-11 items-center justify-center rounded-[14px] bg-app-surface-muted dark:bg-app-surface-muted-dark">
        <SymbolView name={icon} size={22} tintColor={theme.colors.primary} />
      </View>
      <View className="mr-[10px] flex-1">
        <Text className="text-base font-bold text-app-text dark:text-app-text-dark">{title}</Text>
        <Text className="mt-sf-xs text-[13px] leading-[18px] text-app-text-subtle dark:text-app-text-subtle-dark">
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

  /*关闭抽屉后跳转到音频文件导入页，传递当前文件夹 id。*/
  const handleImportFile = React.useCallback(() => {
    close();
    const href = folderId
      ? ({ pathname: '/import-audio', params: { folderId } } as never)
      : ('/import-audio' as never);
    router.push(href);
  }, [close, folderId, router]);

  const handleImportLink = React.useCallback(() => {
    close();
    const href = folderId
      ? ({ pathname: '/import-link', params: { folderId } } as never)
      : ('/import-link' as never);
    router.push(href);
  }, [close, folderId, router]);

  return (
    <Modal animationType="none" visible={isOpen} transparent statusBarTranslucent onRequestClose={close}>
      <View className="flex-1 justify-end">
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} className="absolute inset-0">
          <Pressable className="flex-1 bg-slate-950/30" onPress={close} />
        </Animated.View>

        <Animated.View
          entering={SlideInDown.duration(220)}
          exiting={SlideOutDown.duration(180)}
          className="rounded-t-[28px] bg-app-background px-5 pt-sf-md dark:bg-app-background-dark"
          style={[
            {
              paddingBottom: insets.bottom + 20,
            },
          ]}
        >
          <View className="mb-[14px] h-[5px] w-11 self-center rounded-sf-pill bg-app-border dark:bg-app-border-dark" />
          <Text className="text-2xl font-bold text-app-text dark:text-app-text-dark">导入灵感</Text>
          <Text className="mt-[6px] text-sm leading-5 text-app-text-subtle dark:text-app-text-subtle-dark">
            支持从外部内容继续沉淀到当前碎片库。
          </Text>

          <View className="mt-5 gap-sf-md">
            <ActionCard
              icon="doc.badge.plus"
              title="导入文件"
              subtitle="从手机文件系统选取音频文件"
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
