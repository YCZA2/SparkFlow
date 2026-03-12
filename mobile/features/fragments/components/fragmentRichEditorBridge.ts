import type { Editor } from '@tiptap/react';
import MarkdownIt from 'markdown-it';

import type {
  FragmentAiPatch,
  FragmentEditorCommand,
  FragmentEditorFormattingState,
  FragmentEditorSnapshot,
  MediaAsset,
} from '@/types/fragment';

import {
  extractAssetIdsFromMarkdown,
  extractPlainTextFromMarkdown,
  normalizeBodyMarkdown,
} from '@/features/fragments/bodyMarkdown';

export function createMarkdownRenderer(mediaAssets: MediaAsset[]): MarkdownIt {
  /*把 asset:// 图片引用渲染为真实地址，并保留素材元信息。 */
  const assetMap = new Map(mediaAssets.map((item) => [item.id, item]));
  const markdown = new MarkdownIt({
    html: false,
    linkify: false,
    breaks: false,
  });
  const defaultImageRule = markdown.renderer.rules.image;
  markdown.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const source = token.attrGet('src') ?? '';
    if (source.startsWith('asset://')) {
      const assetId = source.replace('asset://', '').trim();
      const asset = assetMap.get(assetId);
      if (asset?.file_url) token.attrSet('src', asset.file_url);
      token.attrSet('data-asset-id', assetId);
      if (asset?.width) token.attrSet('data-width', String(asset.width));
      if (asset?.height) token.attrSet('data-height', String(asset.height));
    }
    return defaultImageRule
      ? defaultImageRule(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options);
  };
  return markdown;
}

export function buildEditorSnapshot(document: Record<string, unknown>): FragmentEditorSnapshot {
  /*把编辑器文档规整成稳定 Markdown 快照，供原生层消费。 */
  const bodyMarkdown = serializeDocumentToMarkdown(document);
  return {
    body_markdown: bodyMarkdown,
    plain_text: extractPlainTextFromMarkdown(bodyMarkdown),
    asset_ids: extractAssetIdsFromMarkdown(bodyMarkdown),
  };
}

export function applyPatchToEditor(
  editor: Editor,
  patch: FragmentAiPatch,
  renderMarkdown: (markdown: string) => string
): void {
  /*统一把 AI patch 先转成 HTML，再按操作类型插入编辑器。 */
  const snippet = normalizeBodyMarkdown(patch.markdown_snippet);
  if (!snippet) return;
  const html = renderMarkdown(snippet);
  const { from, to } = editor.state.selection;

  if (patch.op === 'replace_selection') {
    editor.commands.insertContentAt({ from, to }, html);
    return;
  }
  if (patch.op === 'prepend_document') {
    editor.commands.insertContentAt(0, html);
    return;
  }
  editor.commands.insertContentAt(to, html);
}

export function syncEditorImages(editor: Editor, mediaAssets: MediaAsset[]): void {
  /*媒体素材地址刷新后，回写现有图片节点属性，避免编辑器停留旧链接。 */
  const assetMap = new Map(mediaAssets.map((item) => [item.id, item]));
  editor.commands.command(({ tr, dispatch }) => {
    let hasChanges = false;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name !== 'image') return;
      const assetId = String(node.attrs.assetId ?? '').trim();
      if (!assetId) return;
      const asset = assetMap.get(assetId);
      if (!asset?.file_url) return;
      const nextAttrs = {
        ...node.attrs,
        src: asset.file_url,
        alt: asset.original_filename,
        width: asset.width ?? undefined,
        height: asset.height ?? undefined,
      };
      const isSame =
        node.attrs.src === nextAttrs.src &&
        node.attrs.alt === nextAttrs.alt &&
        node.attrs.width === nextAttrs.width &&
        node.attrs.height === nextAttrs.height;
      if (isSame) return;
      tr.setNodeMarkup(pos, undefined, nextAttrs);
      hasChanges = true;
    });
    if (!hasChanges) return false;
    dispatch?.(tr);
    return true;
  });
}

export function buildFormattingState(editor: Editor): FragmentEditorFormattingState {
  /*从当前编辑器状态提取工具栏需要的最小格式信息。 */
  let blockType: FragmentEditorFormattingState['block_type'] = 'paragraph';
  if (editor.isActive('heading', { level: 1 })) blockType = 'heading';
  else if (editor.isActive('bulletList')) blockType = 'bulletList';
  else if (editor.isActive('orderedList')) blockType = 'orderedList';
  else if (editor.isActive('blockquote')) blockType = 'blockquote';
  return {
    block_type: blockType,
    bold: editor.isActive('bold'),
    italic: editor.isActive('italic'),
    bullet_list: editor.isActive('bulletList'),
    ordered_list: editor.isActive('orderedList'),
    blockquote: editor.isActive('blockquote'),
    can_undo: editor.can().chain().focus().undo().run(),
    can_redo: editor.can().chain().focus().redo().run(),
  };
}

export function runEditorCommand(editor: Editor, command: FragmentEditorCommand): void {
  /*把原生命令稳定映射到 Tiptap，避免页面层关心 DOM 实现细节。 */
  const chain = editor.chain().focus();
  if (command === 'paragraph') {
    chain.setParagraph().run();
    return;
  }
  if (command === 'heading') {
    chain.toggleHeading({ level: 1 }).run();
    return;
  }
  if (command === 'blockquote') {
    chain.toggleBlockquote().run();
    return;
  }
  if (command === 'bulletList') {
    chain.toggleBulletList().run();
    return;
  }
  if (command === 'orderedList') {
    chain.toggleOrderedList().run();
    return;
  }
  if (command === 'bold') {
    chain.toggleBold().run();
    return;
  }
  if (command === 'italic') {
    chain.toggleItalic().run();
    return;
  }
  if (command === 'undo') {
    editor.commands.focus();
    editor.commands.undo();
    return;
  }
  editor.commands.focus();
  editor.commands.redo();
}

function serializeDocumentToMarkdown(document: Record<string, unknown>): string {
  /*把编辑器 JSON 序列化为当前产品支持的轻量 Markdown。 */
  const content = Array.isArray(document.content) ? document.content : [];
  const blocks = content
    .map((node) => serializeBlock(node as Record<string, unknown>, 1))
    .filter(Boolean);
  return normalizeBodyMarkdown(blocks.join('\n\n'));
}

function serializeBlock(node: Record<string, unknown>, orderedIndex: number): string {
  /*按块类型输出稳定文本，减少 bridge 往返时的噪声差异。 */
  const type = String(node.type ?? '');
  if (type === 'paragraph') return serializeInlineChildren(node);
  if (type === 'heading') return `# ${serializeInlineChildren(node).trim()}`.trim();
  if (type === 'blockquote') {
    const lines = getNodeContent(node)
      .map((child) => serializeBlock(child, 1))
      .filter(Boolean)
      .flatMap((block) => block.split('\n'))
      .map((line) => `> ${line}`);
    return lines.join('\n');
  }
  if (type === 'bulletList') {
    return getNodeContent(node)
      .map((child) => `- ${serializeListItem(child).trim()}`.trim())
      .filter(Boolean)
      .join('\n');
  }
  if (type === 'orderedList') {
    return getNodeContent(node)
      .map((child, index) => `${index + orderedIndex}. ${serializeListItem(child).trim()}`.trim())
      .filter(Boolean)
      .join('\n');
  }
  if (type === 'image') {
    const attrs = (node.attrs as Record<string, unknown> | undefined) ?? {};
    const alt = escapeInlineText(String(attrs.alt ?? '').trim());
    const assetId = String(attrs.assetId ?? '').trim();
    const src = String(attrs.src ?? '').trim();
    const target = assetId ? `asset://${assetId}` : src;
    return target ? `![${alt}](${target})` : '';
  }
  return '';
}

function serializeListItem(node: Record<string, unknown>): string {
  /*列表项当前只保留单段落内容，避免输出团队未支持的嵌套语法。 */
  const children = getNodeContent(node);
  const paragraph = children.find((child) => String(child.type ?? '') === 'paragraph');
  if (!paragraph) return '';
  return serializeInlineChildren(paragraph);
}

function serializeInlineChildren(node: Record<string, unknown>): string {
  /*递归序列化段落内联内容，并保留粗体和斜体。 */
  return getNodeContent(node)
    .map((child) => serializeInlineNode(child))
    .join('')
    .trim();
}

function serializeInlineNode(node: Record<string, unknown>): string {
  /*当前正文内联层只支持文本和有限格式标记。 */
  const type = String(node.type ?? '');
  if (type !== 'text') return '';
  const marks = Array.isArray(node.marks) ? node.marks : [];
  const hasBold = marks.some(
    (mark) => mark && typeof mark === 'object' && (mark as { type?: string }).type === 'bold'
  );
  const hasItalic = marks.some(
    (mark) => mark && typeof mark === 'object' && (mark as { type?: string }).type === 'italic'
  );
  const text = escapeInlineText(String(node.text ?? ''));
  if (!text) return '';
  if (hasBold && hasItalic) return `***${text}***`;
  if (hasBold) return `**${text}**`;
  if (hasItalic) return `*${text}*`;
  return text;
}

function getNodeContent(node: Record<string, unknown>): Array<Record<string, unknown>> {
  /*安全读取节点子内容，避免 bridge 吃到非数组结构。 */
  return Array.isArray(node.content)
    ? node.content.filter(
        (item): item is Record<string, unknown> => Boolean(item && typeof item === 'object')
      )
    : [];
}

function escapeInlineText(text: string): string {
  /*转义内联 Markdown 特殊字符，保证序列化前后正文语义稳定。 */
  return text.replace(/([\\`*_[\]<>])/g, '\\$1');
}
