import React from 'react';
import { Modal, Pressable, ScrollView, TouchableOpacity, View, Text } from 'react-native';
import { SymbolView } from 'expo-symbols';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
      className="mb-[10px] flex-row items-center gap-sf-md rounded-[18px] border bg-app-surface px-[14px] py-[14px] dark:bg-app-surface-dark"
      style={[
        theme.shadow.card,
        { borderColor: theme.colors.border },
      ]}
    >
      <View className="h-[34px] w-[34px] items-center justify-center rounded-full bg-app-surface-muted dark:bg-app-surface-muted-dark">
        <SymbolView name={icon} size={18} tintColor={theme.colors.primary} />
      </View>
      <View className="flex-1">
        <Text className="text-[15px] font-semibold text-app-text dark:text-app-text-dark">{title}</Text>
        <Text className="mt-[2px] text-xs leading-[18px] text-app-text-subtle dark:text-app-text-subtle-dark">{subtitle}</Text>
      </View>
      <SymbolView name="chevron.right" size={16} tintColor={theme.colors.textSubtle} />
    </TouchableOpacity>
  );
}

function InfoCard({ children }: { children: React.ReactNode }) {
  /*统一只读信息卡片样式，避免抽屉和正文主舞台互相打架。 */
  const theme = useAppTheme();
  return (
    <View className="rounded-[18px] bg-app-surface p-[14px] dark:bg-app-surface-dark" style={theme.shadow.card}>
      {children}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  /*统一抽屉区块标题与内容间距。 */
  return (
    <View className="mb-[22px]">
      <Text className="mb-[10px] text-[13px] font-bold uppercase tracking-[0.4px] text-[#8C8478]">{title}</Text>
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
      <View className="flex-1 justify-end">
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} className="absolute inset-0">
          <Pressable className="flex-1 bg-black/30" onPress={actions.onClose} />
        </Animated.View>

        <Animated.View
          entering={SlideInDown.duration(220)}
          exiting={SlideOutDown.duration(180)}
          className="max-h-[82%] rounded-t-[28px] bg-app-background px-5 pt-sf-md dark:bg-app-background-dark"
          style={[
            { paddingBottom: insets.bottom + 20 },
          ]}
        >
          <View className="mb-[14px] h-[5px] w-11 self-center rounded-sf-pill bg-app-border dark:bg-app-border-dark" />
          <View className="mb-[18px] flex-row items-start justify-between gap-sf-lg">
            <View>
              <Text className="text-lg font-bold text-app-text dark:text-app-text-dark">更多内容</Text>
              <Text className="mt-sf-xs text-[13px] leading-[18px] text-app-text-subtle dark:text-app-text-subtle-dark">
                来源碎片、生成信息和拍摄入口都收在这里。
              </Text>
            </View>
            <TouchableOpacity className="h-8 w-8 items-center justify-center rounded-full" onPress={actions.onClose} hitSlop={8}>
              <SymbolView name="xmark" size={16} tintColor={theme.colors.textSubtle} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerClassName="pb-sf-sm" showsVerticalScrollIndicator={false}>
            <Section title="成稿信息">
              <InfoCard>
                <Text className="text-sm leading-[22px] text-app-text dark:text-app-text-dark">模式：{modeLabel(metadata.mode)}</Text>
                <Text className="text-sm leading-[22px] text-app-text dark:text-app-text-dark">生成类型：{generationLabel(metadata.generationKind)}</Text>
                <Text className="text-sm leading-[22px] text-app-text dark:text-app-text-dark">拍摄状态：{metadata.isFilmed ? '已拍摄' : '未拍摄'}</Text>
                <Text className="text-sm leading-[22px] text-app-text-subtle dark:text-app-text-subtle-dark">
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
                  <Text className="text-sm leading-[22px] text-app-text-subtle dark:text-app-text-subtle-dark">
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
