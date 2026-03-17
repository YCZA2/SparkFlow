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
import { FragmentAudioPlayerControls } from '@/features/fragments/components/FragmentAudioPlayerControls';
import { TranscriptSection } from '@/features/fragments/components/TranscriptSection';
import { normalizeFragmentTags } from '@/features/fragments/utils';
import { useAppTheme } from '@/theme/useAppTheme';
import type { Fragment } from '@/types/fragment';
import { formatDate } from '@/utils/date';

interface FragmentDetailSheetProps {
  visible: boolean;
  content: {
    audioFileUrl: string | null;
    transcript: string | null;
    speakerSegments: Fragment['speaker_segments'];
    summary: string | null;
    tags: string[] | null;
  };
  metadata: {
    source: Fragment['source'];
    audioSource: Fragment['audio_source'] | null;
    createdAt: string;
    folderName: string;
    isFilmed: boolean;
    relatedScriptsCount: number;
  };
  activeSegmentIndex: number | null;
  player: {
    isReady: boolean;
    isPlaying: boolean;
    positionMs: number;
    durationMs: number;
    playbackRate: number;
    isResolving: boolean;
    togglePlayback: () => void;
    seekTo: (positionMs: number) => void | Promise<void>;
    skipForward: () => void | Promise<void>;
    skipBackward: () => void | Promise<void>;
    cyclePlaybackRate: () => void;
    playSegment: (segment: NonNullable<Fragment['speaker_segments']>[number]) => Promise<void>;
  };
  tools: {
    supportsImages: boolean;
    isUploadingImage: boolean;
    onInsertImage: () => Promise<void>;
  };
  actions: {
    isDeleting: boolean;
    onClose: () => void;
    onShoot: () => void;
    onOpenRelatedScripts: () => void;
    onDelete: () => void;
  };
}

function getSourceLabel(source: string): string {
  const labels: Record<string, string> = {
    voice: '语音记录',
    manual: '文字记录',
    video_parse: '视频解析',
  };
  return labels[source] || source;
}

function getAudioSourceLabel(audioSource: Fragment['audio_source']): string | null {
  if (audioSource === 'external_link') return '外链导入';
  if (audioSource === 'upload') return '本地上传';
  return null;
}

function ToolRow({
  icon,
  title,
  subtitle,
  onPress,
  disabled = false,
}: {
  icon: React.ComponentProps<typeof SymbolView>['name'];
  title: string;
  subtitle: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  /*渲染抽屉内的整理工具入口，统一动作密度和视觉层级。 */
  const theme = useAppTheme();

  return (
    <TouchableOpacity
      activeOpacity={0.82}
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.toolRow,
        theme.shadow.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          opacity: disabled ? 0.55 : 1,
        },
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

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  /*统一抽屉内区块标题和内容间距，减少重复样式。 */
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function InfoCard({ children }: { children: React.ReactNode }) {
  /*统一抽屉卡片容器，避免各区块重复拼装主题样式。 */
  const theme = useAppTheme();

  return (
    <View
      style={[
        styles.infoCard,
        theme.shadow.card,
        { backgroundColor: theme.colors.surface },
      ]}
    >
      {children}
    </View>
  );
}

function AudioTranscriptSection({
  content,
  activeSegmentIndex,
  player,
}: Pick<
  FragmentDetailSheetProps,
  'content' | 'activeSegmentIndex' | 'player'
> & { content: FragmentDetailSheetProps['content'] & { bodyHtml?: string | null } }) {
  /*单独渲染原文与音频区块，保持播放器和转写的展示边界。 */
  const theme = useAppTheme();
  const hasAudio = Boolean(content.audioFileUrl);
  const hasTranscript = Boolean(content.transcript?.trim() || content.speakerSegments?.length);
  // 如果 bodyHtml 有内容，说明已在编辑区显示，不需要在抽屉中重复显示语音原文
  const shouldShowTranscript = !content.bodyHtml?.trim() && hasTranscript;

  return (
    <Section title="原文与音频">
      {hasAudio ? (
        <View style={styles.audioSection}>
          <FragmentAudioPlayerControls
            isReady={player.isReady}
            isPlaying={player.isPlaying}
            positionMs={player.positionMs}
            durationMs={player.durationMs}
            playbackRate={player.playbackRate}
            disabled={player.isResolving}
            compact={true}
            onTogglePlay={player.togglePlayback}
            onSeek={player.seekTo}
            onSkipForward={player.skipForward}
            onSkipBackward={player.skipBackward}
            onChangeRate={player.cyclePlaybackRate}
          />
        </View>
      ) : null}

      {shouldShowTranscript ? (
        <TranscriptSection
          transcript={content.transcript}
          speakerSegments={content.speakerSegments}
          audioPath={content.audioFileUrl}
          activeIndex={activeSegmentIndex}
          activeSegmentId={null}
          dense={true}
          onSegmentPress={({ segment }) => {
            void player.playSegment(segment);
          }}
        />
      ) : null}
      {!hasAudio && !shouldShowTranscript ? (
        <InfoCard>
          <Text style={[styles.emptyText, { color: theme.colors.textSubtle }]}>
            这条碎片没有可查看的语音原文。
          </Text>
        </InfoCard>
      ) : null}
    </Section>
  );
}

function ToolsSection({ tools }: Pick<FragmentDetailSheetProps, 'tools'>) {
  /*把当前仍真实可用的正文工具收口为独立区块。 */
  if (!tools.supportsImages) return null;

  return (
    <Section title="整理工具">
      <ToolRow
        icon="photo"
        title={tools.isUploadingImage ? '正在插图' : '插入图片'}
        subtitle="把图片插进正文，和笔记内容一起保存。"
        onPress={() => {
          void tools.onInsertImage();
        }}
        disabled={tools.isUploadingImage}
      />
    </Section>
  );
}

function ActionsSection({
  metadata,
  actions,
}: Pick<FragmentDetailSheetProps, 'metadata' | 'actions'>) {
  /*把拍摄入口和关联成稿收进快捷操作，和 script 详情保持一致节奏。 */
  return (
    <Section title="快捷操作">
      <ToolRow
        icon="video"
        title="进入拍摄"
        subtitle="直接使用当前正文作为提词内容开始拍摄。"
        onPress={actions.onShoot}
      />
      <ToolRow
        icon="text.document"
        title="查看关联成稿"
        subtitle={
          metadata.relatedScriptsCount > 0
            ? `已找到 ${metadata.relatedScriptsCount} 篇来源包含这条碎片的成稿。`
            : '还没有关联成稿，之后生成的稿件会出现在这里。'
        }
        onPress={actions.onOpenRelatedScripts}
      />
    </Section>
  );
}

function MetadataSection({
  content,
  metadata,
}: Pick<FragmentDetailSheetProps, 'content' | 'metadata'>) {
  /*把摘要、来源、标签等信息集中在只读区块展示。 */
  const theme = useAppTheme();
  const tags = normalizeFragmentTags(content.tags);
  const sourceLabel = getSourceLabel(metadata.source);
  const audioSourceLabel = getAudioSourceLabel(metadata.audioSource);

  return (
    <Section title="碎片信息">
      {content.summary ? (
        <InfoCard>
          <Text style={[styles.infoLabel, { color: theme.colors.textSubtle }]}>AI 摘要</Text>
          <Text style={[styles.summaryText, { color: theme.colors.text }]}>
            {content.summary}
          </Text>
        </InfoCard>
      ) : null}

      <InfoCard>
        <InfoRow label="来源" value={sourceLabel} />
        {audioSourceLabel ? <InfoRow label="音频来源" value={audioSourceLabel} /> : null}
        <InfoRow label="创建时间" value={formatDate(metadata.createdAt)} />
        <InfoRow label="文件夹" value={metadata.folderName} />
        <InfoRow label="拍摄状态" value={metadata.isFilmed ? '已拍摄' : '未拍摄'} />
      </InfoCard>

      {tags.length > 0 ? (
        <InfoCard>
          <Text style={[styles.infoLabel, { color: theme.colors.textSubtle }]}>标签</Text>
          <View style={styles.tagsWrap}>
            {tags.map((tag) => (
              <View
                key={tag}
                style={[styles.tag, { backgroundColor: theme.colors.surfaceMuted }]}
              >
                <Text style={[styles.tagText, { color: theme.colors.text }]}>{tag}</Text>
              </View>
            ))}
          </View>
        </InfoCard>
      ) : null}
    </Section>
  );
}

function DangerSection({ actions }: Pick<FragmentDetailSheetProps, 'actions'>) {
  /*把删除入口独立出来，避免和信息区块混排。 */
  const theme = useAppTheme();

  return (
    <Section title="危险操作">
      <TouchableOpacity
        activeOpacity={0.82}
        onPress={actions.onDelete}
        disabled={actions.isDeleting}
        style={[
          styles.deleteButton,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.danger,
            opacity: actions.isDeleting ? 0.65 : 1,
          },
        ]}
      >
        <Text style={[styles.deleteText, { color: theme.colors.danger }]}>
          {actions.isDeleting ? '删除中...' : '删除这条碎片'}
        </Text>
      </TouchableOpacity>
    </Section>
  );
}

export function FragmentDetailSheet({
  visible,
  content,
  metadata,
  activeSegmentIndex,
  player,
  tools,
  actions,
}: FragmentDetailSheetProps) {
  /*在底部抽屉中收纳原文、音频、整理工具和碎片信息。 */
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

          <ScrollView
            contentContainerStyle={styles.sheetContent}
            showsVerticalScrollIndicator={false}
          >
            <AudioTranscriptSection
              content={content}
              activeSegmentIndex={activeSegmentIndex}
              player={player}
            />
            <ToolsSection tools={tools} />
            <ActionsSection metadata={metadata} actions={actions} />
            <MetadataSection content={content} metadata={metadata} />
            <DangerSection actions={actions} />
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  /*展示单行碎片元信息，保持标签和值的对齐关系。 */
  const theme = useAppTheme();

  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: theme.colors.textSubtle }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: theme.colors.text }]}>{value}</Text>
    </View>
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
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  audioSection: {
    marginBottom: 4,
  },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
  },
  toolIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  toolCopy: {
    flex: 1,
    marginRight: 10,
  },
  toolTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  toolSubtitle: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
  },
  infoCard: {
    borderRadius: 18,
    padding: 14,
  },
  infoRow: {
    paddingVertical: 8,
  },
  infoLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  infoValue: {
    marginTop: 4,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
  },
  summaryText: {
    marginTop: 8,
    fontSize: 16,
    lineHeight: 26,
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  tagText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  deleteButton: {
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 22,
  },
});
