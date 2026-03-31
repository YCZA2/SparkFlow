import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/Themed';
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
      <View style={styles.modalRoot}>
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={StyleSheet.absoluteFill}>
          <Pressable style={styles.backdrop} onPress={actions.onClose} />
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
          <View style={styles.sheetHeader}>
            <View>
              <Text style={[styles.sheetTitle, { color: theme.colors.text }]}>更多内容</Text>
              <Text style={[styles.sheetSubtitle, { color: theme.colors.textSubtle }]}>
                原文、音频、整理工具和碎片信息都收在这里。
              </Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={actions.onClose} hitSlop={8}>
              <SymbolView name="xmark" size={16} tintColor={theme.colors.textSubtle} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
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
    maxHeight: '88%',
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
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
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
  closeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetContent: {
    paddingTop: 20,
    gap: 20,
  },
});
