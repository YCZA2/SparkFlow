import React from 'react';
import { Modal, Pressable, ScrollView, TouchableOpacity, View, Text } from 'react-native';
import { SymbolView } from 'expo-symbols';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FragmentDetailSheetSections } from '@/features/fragments/components/detailSheet/FragmentDetailSheetSections';
import type { FragmentDetailSheetProps } from '@/features/fragments/components/detailSheet/types';
import { useAppTheme } from '@/theme/useAppTheme';

export function FragmentDetailSheet({
  visible,
  content,
  metadata,
  activeSegmentIndex,
  player,
  tools,
  actions,
}: FragmentDetailSheetProps) {
  /*在底部抽屉中收纳原文、音频、整理工具和碎片信息，主文件只保留 modal 壳层。 */
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal animationType="none" visible={visible} transparent statusBarTranslucent onRequestClose={actions.onClose}>
      <View className="flex-1 justify-end">
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} className="absolute inset-0">
          <Pressable className="flex-1 bg-slate-950/30" onPress={actions.onClose} />
        </Animated.View>

        <Animated.View
          entering={SlideInDown.duration(220)}
          exiting={SlideOutDown.duration(180)}
          className="max-h-[88%] rounded-t-[28px] bg-app-background px-5 pt-sf-md dark:bg-app-background-dark"
          style={[
            {
              paddingBottom: insets.bottom + 20,
            },
          ]}
        >
          <View className="mb-[14px] h-[5px] w-11 self-center rounded-sf-pill bg-app-border dark:bg-app-border-dark" />
          <View className="flex-row items-start justify-between gap-sf-md">
            <View>
              <Text className="text-2xl font-bold text-app-text dark:text-app-text-dark">更多内容</Text>
              <Text className="mt-[6px] text-sm leading-5 text-app-text-subtle dark:text-app-text-subtle-dark">
                原文、音频、整理工具和碎片信息都收在这里。
              </Text>
            </View>
            <TouchableOpacity className="h-8 w-8 items-center justify-center" onPress={actions.onClose} hitSlop={8}>
              <SymbolView name="xmark" size={16} tintColor={theme.colors.textSubtle} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerClassName="gap-5 pt-5" showsVerticalScrollIndicator={false}>
            <FragmentDetailSheetSections
              content={content}
              metadata={metadata}
              activeSegmentIndex={activeSegmentIndex}
              player={player}
              tools={tools}
              actions={actions}
            />
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}
