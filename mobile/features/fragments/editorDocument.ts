import type { EditorDocument, EditorNode, EditorSelectionRange, MediaAsset, FragmentAiPatch } from '@/types/fragment';

const EMPTY_EDITOR_DOCUMENT: EditorDocument = { type: 'doc', content: [] };

function isEditorNode(value: unknown): value is EditorNode {
  /** 中文注释：粗校验节点形状，避免渲染层消费脏数据。 */
  return Boolean(value && typeof value === 'object' && typeof (value as EditorNode).type === 'string');
}

export function emptyEditorDocument(): EditorDocument {
  /** 中文注释：返回稳定空文档，供新建正文和失败回退复用。 */
  return { type: 'doc', content: [] };
}

export function buildDocumentFromText(text: string, blockType: 'paragraph' | 'heading' = 'paragraph'): EditorDocument {
  /** 中文注释：把普通文本包装成最小 ProseMirror 文档。 */
  const normalized = text.trim();
  if (!normalized) return emptyEditorDocument();
  if (blockType === 'heading') {
    return {
      type: 'doc',
      content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: normalized }] }],
    };
  }
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: normalized }] }],
  };
}

function convertLegacyDocument(document: Record<string, unknown>): EditorDocument {
  /** 中文注释：把旧 blocks/children 文档转成 ProseMirror，兼容本地草稿或历史缓存。 */
  const rawBlocks = Array.isArray(document.blocks) ? document.blocks : [];
  const content: EditorNode[] = rawBlocks.flatMap((rawBlock) => {
    if (!rawBlock || typeof rawBlock !== 'object') return [];
    const block = rawBlock as Record<string, unknown>;
    const blockType = typeof block.type === 'string' ? block.type : '';
    if (blockType === 'image') {
      return [{
        type: 'image',
        attrs: {
          src: typeof block.url === 'string' ? block.url : null,
          alt: typeof block.alt === 'string' ? block.alt : null,
          assetId: typeof block.asset_id === 'string' ? block.asset_id : null,
          width: typeof block.width === 'number' ? block.width : null,
          height: typeof block.height === 'number' ? block.height : null,
        },
      }];
    }
    const children = Array.isArray(block.children) ? block.children : [];
    const textContent: EditorNode[] = children.flatMap((rawChild) => {
      if (!rawChild || typeof rawChild !== 'object') return [];
      const child = rawChild as Record<string, unknown>;
      const text = typeof child.text === 'string' ? child.text : '';
      const rawMarks = Array.isArray(child.marks) ? child.marks : [];
      const marks = rawMarks
        .filter((mark): mark is 'bold' | 'italic' => mark === 'bold' || mark === 'italic')
        .map((mark) => ({ type: mark }));
      if (!text && marks.length === 0) return [];
      return [{ type: 'text', text, marks: marks.length > 0 ? marks : undefined }];
    });
    const paragraph: EditorNode = { type: 'paragraph', content: textContent.length > 0 ? textContent : [{ type: 'text', text: '' }] };
    switch (blockType) {
      case 'heading':
        return [{ type: 'heading', attrs: { level: 1 }, content: paragraph.content }];
      case 'blockquote':
        return [{ type: 'blockquote', content: [paragraph] }];
      case 'bullet_list':
        return [{ type: 'bulletList', content: [{ type: 'listItem', content: [paragraph] }] }];
      case 'ordered_list':
        return [{ type: 'orderedList', content: [{ type: 'listItem', content: [paragraph] }] }];
      default:
        return [paragraph];
    }
  });
  return { type: 'doc', content };
}

export function normalizeEditorDocument(document: EditorDocument | Record<string, unknown> | null | undefined): EditorDocument {
  /** 中文注释：规整服务端和本地正文，统一成 ProseMirror 文档。 */
  if (!document || typeof document !== 'object') return emptyEditorDocument();
  if (document.type !== 'doc') return emptyEditorDocument();
  if ('blocks' in document && !('content' in document)) {
    return convertLegacyDocument(document);
  }
  const rawContent = Array.isArray((document as EditorDocument).content) ? (document as EditorDocument).content : [];
  return {
    type: 'doc',
    content: rawContent.filter(isEditorNode).map(normalizeNode),
  };
}

function normalizeNode(node: EditorNode): EditorNode {
  /** 中文注释：递归清洗节点字段，避免桥接层传入 undefined 结构。 */
  const normalized: EditorNode = { type: node.type };
  if (node.attrs && typeof node.attrs === 'object') {
    normalized.attrs = { ...node.attrs };
  }
  if (typeof node.text === 'string') {
    normalized.text = node.text;
  }
  if (Array.isArray(node.marks)) {
    normalized.marks = node.marks
      .filter((mark) => mark?.type === 'bold' || mark?.type === 'italic')
      .map((mark) => ({ type: mark.type }));
  }
  if (Array.isArray(node.content)) {
    normalized.content = node.content.filter(isEditorNode).map(normalizeNode);
  } else if (node.type !== 'text' && node.type !== 'image') {
    normalized.content = [];
  }
  return normalized;
}

export function extractPlainText(document: EditorDocument | null | undefined): string {
  /** 中文注释：从 ProseMirror 文档递归提取纯文本快照。 */
  return normalizeEditorDocument(document).content
    .map(extractNodePlainText)
    .filter(Boolean)
    .join('\n')
    .trim();
}

function extractNodePlainText(node: EditorNode): string {
  /** 中文注释：按节点类型递归提取当前节点文本。 */
  if (node.type === 'text') return node.text?.trim() ?? '';
  if (node.type === 'image') return String(node.attrs?.alt ?? '').trim();
  if (!node.content?.length) return '';
  if (node.type === 'bulletList' || node.type === 'orderedList') {
    return node.content.map(extractNodePlainText).filter(Boolean).join('\n');
  }
  return node.content.map(extractNodePlainText).join('');
}

export function collectDocumentAssetIds(document: EditorDocument): string[] {
  /** 中文注释：递归收集图片节点中的素材引用。 */
  const assetIds: string[] = [];
  normalizeEditorDocument(document).content.forEach((node) => collectAssetIdsFromNode(node, assetIds));
  return assetIds;
}

function collectAssetIdsFromNode(node: EditorNode, assetIds: string[]): void {
  /** 中文注释：深度遍历图片节点并收集 assetId。 */
  if (node.type === 'image') {
    const assetId = typeof node.attrs?.assetId === 'string' ? node.attrs.assetId.trim() : '';
    if (assetId && !assetIds.includes(assetId)) assetIds.push(assetId);
    return;
  }
  node.content?.forEach((child) => collectAssetIdsFromNode(child, assetIds));
}

export function buildImageNode(asset: MediaAsset): EditorNode {
  /** 中文注释：把统一媒体资源映射为正文图片节点。 */
  return {
    type: 'image',
    attrs: {
      src: asset.file_url ?? null,
      alt: asset.original_filename,
      assetId: asset.id,
      width: asset.width ?? null,
      height: asset.height ?? null,
    },
  };
}

export function applyAiPatch(document: EditorDocument, patch: FragmentAiPatch): EditorDocument {
  /** 中文注释：在本地文档上应用 AI patch，供无编辑器实例场景回退。 */
  const normalized = normalizeEditorDocument(document);
  if (patch.op === 'prepend_heading' && patch.block) {
    return { type: 'doc', content: [normalizeNode(patch.block), ...normalized.content] };
  }
  if (patch.op === 'insert_block_after_range') {
    const blocks = Array.isArray(patch.blocks) ? patch.blocks.map(normalizeNode) : [];
    return { type: 'doc', content: [...normalized.content, ...blocks] };
  }
  if (patch.op === 'replace_range') {
    return buildDocumentFromText(patch.text ?? '');
  }
  return normalized;
}

export function normalizeSelectionRange(range: EditorSelectionRange | null | undefined): EditorSelectionRange | null {
  /** 中文注释：规整选区范围，避免把无效坐标发给后端。 */
  if (!range) return null;
  const from = typeof range.from === 'number' ? range.from : null;
  const to = typeof range.to === 'number' ? range.to : null;
  if (from === null || to === null || from < 0 || to < 0) return null;
  return { from, to };
}

export const EMPTY_DOCUMENT = EMPTY_EDITOR_DOCUMENT;
