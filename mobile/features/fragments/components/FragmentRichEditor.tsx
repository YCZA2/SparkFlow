import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Text } from '@/components/Themed';
import {
  insertParagraphAfter,
  normalizeEditorDocument,
  removeBlock,
  setBlockType,
  toggleBlockMark,
  updateBlockText,
} from '@/features/fragments/editorDocument';
import { useAppTheme } from '@/theme/useAppTheme';
import type { EditorDocument, EditorTextBlock } from '@/types/fragment';

interface FragmentRichEditorProps {
  document: EditorDocument;
  activeBlockId: string | null;
  statusLabel?: string | null;
  isUploadingImage?: boolean;
  isAiRunning?: boolean;
  onSelectBlock: (blockId: string | null) => void;
  onChangeDocument: (document: EditorDocument) => void;
  onInsertImage: () => Promise<void>;
  onAiAction: (instruction: 'polish' | 'shorten' | 'expand' | 'title' | 'script_seed') => Promise<void>;
}

export function FragmentRichEditor({
  document,
  activeBlockId,
  statusLabel,
  isUploadingImage = false,
  isAiRunning = false,
  onSelectBlock,
  onChangeDocument,
  onInsertImage,
  onAiAction,
}: FragmentRichEditorProps) {
  /** 中文注释：渲染块级富文本编辑器和操作工具栏。 */
  const theme = useAppTheme();
  const normalizedDocument = normalizeEditorDocument(document);
  const activeTextBlock = normalizedDocument.blocks.find((block) => block.id === activeBlockId && block.type !== 'image') as EditorTextBlock | undefined;

  const handleSetType = (type: EditorTextBlock['type']) => {
    if (!activeBlockId) return;
    onChangeDocument(setBlockType(normalizedDocument, activeBlockId, type));
  };

  const handleToggleMark = (mark: 'bold' | 'italic') => {
    if (!activeBlockId) return;
    onChangeDocument(toggleBlockMark(normalizedDocument, activeBlockId, mark));
  };

  return (
    <View style={[styles.card, theme.shadow.card, { backgroundColor: theme.colors.surface }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.cardTitle, { color: theme.colors.textSubtle }]}>整理正文</Text>
        {statusLabel ? <Text style={[styles.statusText, { color: theme.colors.textSubtle }]}>{statusLabel}</Text> : null}
      </View>
      <Text style={[styles.hintText, { color: theme.colors.textSubtle }]}>
        这里编辑的是碎片正式正文，AI、导出和脚本生成都会直接读取这份富文本内容。
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolbarRow}>
        <ToolbarButton label="段落" onPress={() => handleSetType('paragraph')} />
        <ToolbarButton label="标题" onPress={() => handleSetType('heading')} />
        <ToolbarButton label="引用" onPress={() => handleSetType('blockquote')} />
        <ToolbarButton label="无序" onPress={() => handleSetType('bullet_list')} />
        <ToolbarButton label="有序" onPress={() => handleSetType('ordered_list')} />
        <ToolbarButton label="粗体" active={activeTextBlock?.children[0]?.marks.includes('bold')} onPress={() => handleToggleMark('bold')} />
        <ToolbarButton label="斜体" active={activeTextBlock?.children[0]?.marks.includes('italic')} onPress={() => handleToggleMark('italic')} />
        <ToolbarButton label={isUploadingImage ? '插图中' : '插图'} onPress={() => void onInsertImage()} />
        <ToolbarButton label="新段落" onPress={() => onChangeDocument(insertParagraphAfter(normalizedDocument, activeBlockId))} />
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolbarRow}>
        <ToolbarButton label={isAiRunning ? 'AI处理中' : '润色'} onPress={() => void onAiAction('polish')} />
        <ToolbarButton label="压缩" onPress={() => void onAiAction('shorten')} />
        <ToolbarButton label="扩写" onPress={() => void onAiAction('expand')} />
        <ToolbarButton label="标题建议" onPress={() => void onAiAction('title')} />
        <ToolbarButton label="脚本草稿" onPress={() => void onAiAction('script_seed')} />
      </ScrollView>

      <View style={styles.blocksColumn}>
        {normalizedDocument.blocks.map((block) => {
          const isActive = activeBlockId === block.id;
          if (block.type === 'image') {
            return (
              <Pressable
                key={block.id}
                onPress={() => onSelectBlock(block.id)}
                style={[
                  styles.imageBlock,
                  { borderColor: isActive ? theme.colors.primary : theme.colors.border, backgroundColor: theme.colors.surfaceMuted },
                ]}
              >
                {block.url ? (
                  <Image source={{ uri: block.url }} style={styles.image} resizeMode="cover" />
                ) : (
                  <View style={[styles.imagePlaceholder, { backgroundColor: theme.colors.border }]} />
                )}
                <View style={styles.imageMeta}>
                  <Text style={[styles.imageLabel, { color: theme.colors.text }]}>{block.alt || '图片素材'}</Text>
                  <Pressable onPress={() => onChangeDocument(removeBlock(normalizedDocument, block.id))}>
                    <Text style={[styles.removeText, { color: theme.colors.danger }]}>删除</Text>
                  </Pressable>
                </View>
              </Pressable>
            );
          }

          const firstChild = block.children[0] ?? { text: '', marks: [] };
          return (
            <Pressable
              key={block.id}
              onPress={() => onSelectBlock(block.id)}
              style={[
                styles.textBlock,
                { borderColor: isActive ? theme.colors.primary : theme.colors.border, backgroundColor: theme.colors.surfaceMuted },
              ]}
            >
              <View style={styles.blockMetaRow}>
                <Text style={[styles.blockMeta, { color: theme.colors.textSubtle }]}>{getBlockLabel(block.type)}</Text>
                <Pressable onPress={() => onChangeDocument(removeBlock(normalizedDocument, block.id))}>
                  <Text style={[styles.removeText, { color: theme.colors.danger }]}>删除</Text>
                </Pressable>
              </View>
              <TextInput
                value={firstChild.text}
                onFocus={() => onSelectBlock(block.id)}
                onChangeText={(value) => onChangeDocument(updateBlockText(normalizedDocument, block.id, value))}
                multiline
                placeholder="输入这一段内容"
                placeholderTextColor={theme.colors.textSubtle}
                style={[
                  styles.blockInput,
                  textStyleForBlock(block.type),
                  {
                    color: theme.colors.text,
                    fontWeight: firstChild.marks.includes('bold') ? '700' : '400',
                    fontStyle: firstChild.marks.includes('italic') ? 'italic' : 'normal',
                  },
                ]}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function ToolbarButton({
  label,
  onPress,
  active = false,
}: {
  label: string;
  onPress: () => void;
  active?: boolean;
}) {
  const theme = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.toolButton,
        {
          backgroundColor: active ? theme.colors.primary : theme.colors.surfaceMuted,
        },
      ]}
    >
      <Text style={[styles.toolButtonText, { color: active ? '#FFFFFF' : theme.colors.text }]}>{label}</Text>
    </Pressable>
  );
}

function getBlockLabel(type: EditorTextBlock['type']): string {
  /** 中文注释：把内部块类型映射成用户可读标签。 */
  const labels: Record<EditorTextBlock['type'], string> = {
    paragraph: '段落',
    heading: '标题',
    blockquote: '引用',
    bullet_list: '无序列表',
    ordered_list: '有序列表',
  };
  return labels[type];
}

function textStyleForBlock(type: EditorTextBlock['type']) {
  /** 中文注释：根据块类型选择输入框排版风格。 */
  switch (type) {
    case 'heading':
      return styles.headingInput;
    case 'blockquote':
      return styles.quoteInput;
    default:
      return styles.paragraphInput;
  }
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  statusText: {
    fontSize: 12,
  },
  hintText: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  toolbarRow: {
    gap: 8,
    paddingBottom: 8,
  },
  toolButton: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  toolButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  blocksColumn: {
    gap: 12,
    marginTop: 8,
  },
  textBlock: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  blockMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  blockMeta: {
    fontSize: 12,
    fontWeight: '600',
  },
  removeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  blockInput: {
    minHeight: 56,
    lineHeight: 24,
    padding: 0,
  },
  paragraphInput: {
    fontSize: 16,
  },
  headingInput: {
    fontSize: 22,
    lineHeight: 30,
  },
  quoteInput: {
    fontSize: 16,
    lineHeight: 24,
  },
  imageBlock: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: 200,
  },
  imagePlaceholder: {
    width: '100%',
    height: 200,
  },
  imageMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
  },
  imageLabel: {
    flex: 1,
    marginRight: 8,
    fontSize: 14,
    fontWeight: '500',
  },
});
