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
import { useAppTheme } from '@/theme/useAppTheme';
import { formatDate } from '@/utils/date';

function ToolRow({
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
  /*统一成稿抽屉里的动作行密度，和碎片更多菜单保持同节奏。 */
  const theme = useAppTheme();
  return (
    <TouchableOpacity
      activeOpacity={0.82}
      onPress={onPress}
      style={[
        styles.toolRow,
        theme.shadow.card,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
      ]}
    >
      <View style={[styles.toolIcon, { backgroundColor: theme.colors.surfaceMuted }]}>
        <SymbolView name={icon} size={18} tintColor={theme.colors.primary} />
      </View>
      <View style={styles.toolCopy}>
        <Text style={[styles.toolTitle, { color: theme.colors.text }]}>{title}</Text>
        <Text style={[styles.toolSubtitle, { color: theme.colors.textSubtle }]}>{subtitle}</Text>
      </View>
      <SymbolView name="chevron.right" size={16} tintColor={theme.colors.textSubtle} />
    </TouchableOpacity>
  );
}

function InfoCard({ children }: { children: React.ReactNode }) {
  /*统一只读信息卡片样式，避免抽屉和正文主舞台互相打架。 */
  const theme = useAppTheme();
  return (
    <View style={[styles.infoCard, theme.shadow.card, { backgroundColor: theme.colors.surface }]}>
      {children}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  /*统一抽屉区块标题与内容间距。 */
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function modeLabel(mode: string): string {
  if (mode === 'mode_daily_push') return '每日推盘生成';
  return '主题 + SOP + few-shot';
}

function generationLabel(kind: string): string {
  return kind === 'daily_push' ? '每日推盘生成' : '手动生成';
}

export function ScriptDetailSheet({
  visible,
  metadata,
  sourceFragments,
  actions,
}: {
  visible: boolean;
  metadata: {
    mode: string;
    generationKind: string;
    createdAt: string | null;
    isFilmed: boolean;
    sourceFragmentCount: number;
  };
  sourceFragments: Array<{ id: string }>;
  actions: {
    onClose: () => void;
    onShoot: () => void;
    onOpenFragment: (fragmentId: string) => void;
  };
}) {
  /*把来源碎片、生成信息和拍摄入口统一收进成稿信息抽屉。 */
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
            { backgroundColor: theme.colors.background, paddingBottom: insets.bottom + 20 },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: theme.colors.border }]} />
          <View style={styles.sheetHeader}>
            <View>
              <Text style={[styles.sheetTitle, { color: theme.colors.text }]}>更多内容</Text>
              <Text style={[styles.sheetSubtitle, { color: theme.colors.textSubtle }]}>
                来源碎片、生成信息和拍摄入口都收在这里。
              </Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={actions.onClose} hitSlop={8}>
              <SymbolView name="xmark" size={16} tintColor={theme.colors.textSubtle} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
            <Section title="成稿信息">
              <InfoCard>
                <Text style={[styles.infoRow, { color: theme.colors.text }]}>模式：{modeLabel(metadata.mode)}</Text>
                <Text style={[styles.infoRow, { color: theme.colors.text }]}>生成类型：{generationLabel(metadata.generationKind)}</Text>
                <Text style={[styles.infoRow, { color: theme.colors.text }]}>拍摄状态：{metadata.isFilmed ? '已拍摄' : '未拍摄'}</Text>
                <Text style={[styles.infoRow, { color: theme.colors.textSubtle }]}>
                  创建时间：{metadata.createdAt ? formatDate(metadata.createdAt) : '-'}
                </Text>
              </InfoCard>
            </Section>

            <Section title="快捷操作">
              <ToolRow
                icon="video"
                title="进入拍摄"
                subtitle="直接使用当前正文作为提词内容开始拍摄。"
                onPress={actions.onShoot}
              />
            </Section>

            <Section title={`来源碎片（${metadata.sourceFragmentCount}）`}>
              {sourceFragments.length > 0 ? (
                sourceFragments.map((fragment) => (
                  <ToolRow
                    key={fragment.id}
                    icon="doc.text"
                    title={`查看碎片 ${fragment.id}`}
                    subtitle="回看这篇成稿最初来自哪条素材。"
                    onPress={() => actions.onOpenFragment(fragment.id)}
                  />
                ))
              ) : (
                <InfoCard>
                  <Text style={[styles.emptyText, { color: theme.colors.textSubtle }]}>
                    当前没有可回溯的来源碎片。
                  </Text>
                </InfoCard>
              )}
            </Section>
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
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: '82%',
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 18,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  sheetSubtitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetContent: {
    paddingBottom: 8,
  },
  section: {
    marginBottom: 22,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 10,
    color: '#8C8478',
  },
  infoCard: {
    borderRadius: 18,
    padding: 14,
  },
  infoRow: {
    fontSize: 14,
    lineHeight: 22,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 22,
  },
  toolRow: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  toolIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolCopy: {
    flex: 1,
  },
  toolTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  toolSubtitle: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 18,
  },
});
