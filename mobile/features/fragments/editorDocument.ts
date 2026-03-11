import type { EditorBlock, EditorBlockType, EditorDocument, EditorMark, MediaAsset, FragmentAiPatch } from '@/types/fragment';

function createId(prefix: string): string {
  /** 中文注释：在客户端生成轻量块 ID，避免依赖服务端临时 ID。 */
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyEditorDocument(): EditorDocument {
  /** 中文注释：返回空正文文档，统一用于新建和无内容回退。 */
  return { type: 'doc', blocks: [] };
}

export function buildDocumentFromText(text: string): EditorDocument {
  /** 中文注释：把普通文本包装成单段正文文档。 */
  const normalized = text.trim();
  if (!normalized) return emptyEditorDocument();
  return {
    type: 'doc',
    blocks: [
      {
        id: createId('block'),
        type: 'paragraph',
        children: [{ text: normalized, marks: [] }],
      },
    ],
  };
}

export function normalizeEditorDocument(document: EditorDocument | null | undefined): EditorDocument {
  /** 中文注释：规整服务端或本地文档，保证渲染期字段齐全。 */
  if (!document || document.type !== 'doc' || !Array.isArray(document.blocks)) {
    return emptyEditorDocument();
  }
  return {
    type: 'doc',
    blocks: document.blocks.map((block) => ({
      ...block,
      id: block.id || createId('block'),
      children: Array.isArray(block.children) ? block.children.map((child) => ({
        text: child.text ?? '',
        marks: Array.isArray(child.marks) ? child.marks.filter((mark): mark is EditorMark => mark === 'bold' || mark === 'italic') : [],
      })) : [],
    })),
  };
}

export function extractPlainText(document: EditorDocument | null | undefined): string {
  /** 中文注释：提取正文纯文本，供列表预览和状态判断复用。 */
  return normalizeEditorDocument(document).blocks
    .map((block) => {
      if (block.type === 'image') {
        return block.alt?.trim() || '';
      }
      return block.children.map((child) => child.text).join('').trim();
    })
    .filter(Boolean)
    .join('\n')
    .trim();
}

export function updateBlockText(document: EditorDocument, blockId: string, text: string): EditorDocument {
  /** 中文注释：更新指定文本块内容，保留现有样式标记。 */
  return {
    type: 'doc',
    blocks: normalizeEditorDocument(document).blocks.map((block) => {
      if (block.id !== blockId || block.type === 'image') return block;
      const firstChild = block.children[0] ?? { text: '', marks: [] };
      return {
        ...block,
        children: [{ text, marks: firstChild.marks }, ...block.children.slice(1).map((child) => ({ ...child, text: '' }))],
      };
    }),
  };
}

export function toggleBlockMark(document: EditorDocument, blockId: string, mark: EditorMark): EditorDocument {
  /** 中文注释：按整块切换粗体或斜体，保持首版交互简单。 */
  return {
    type: 'doc',
    blocks: normalizeEditorDocument(document).blocks.map((block) => {
      if (block.id !== blockId || block.type === 'image') return block;
      const firstChild = block.children[0] ?? { text: '', marks: [] };
      const marks = firstChild.marks.includes(mark)
        ? firstChild.marks.filter((item) => item !== mark)
        : [...firstChild.marks, mark];
      return {
        ...block,
        children: [{ text: firstChild.text, marks }, ...block.children.slice(1)],
      };
    }),
  };
}

export function setBlockType(document: EditorDocument, blockId: string, type: Exclude<EditorBlockType, 'image'>): EditorDocument {
  /** 中文注释：切换块级类型，用于标题、引用和列表。 */
  return {
    type: 'doc',
    blocks: normalizeEditorDocument(document).blocks.map((block) => block.id === blockId && block.type !== 'image' ? { ...block, type } : block),
  };
}

export function insertParagraphAfter(document: EditorDocument, blockId?: string | null): EditorDocument {
  /** 中文注释：在当前块后插入一个空段落，便于继续编辑。 */
  const nextBlock: EditorBlock = {
    id: createId('block'),
    type: 'paragraph',
    children: [{ text: '', marks: [] }],
  };
  const normalized = normalizeEditorDocument(document);
  if (!blockId) {
    return { type: 'doc', blocks: [...normalized.blocks, nextBlock] };
  }
  const nextBlocks: EditorBlock[] = [];
  let inserted = false;
  normalized.blocks.forEach((block) => {
    nextBlocks.push(block);
    if (block.id === blockId) {
      nextBlocks.push(nextBlock);
      inserted = true;
    }
  });
  if (!inserted) nextBlocks.push(nextBlock);
  return { type: 'doc', blocks: nextBlocks };
}

export function removeBlock(document: EditorDocument, blockId: string): EditorDocument {
  /** 中文注释：删除指定块，避免正文中残留无效空块。 */
  return {
    type: 'doc',
    blocks: normalizeEditorDocument(document).blocks.filter((block) => block.id !== blockId),
  };
}

export function insertImageBlock(document: EditorDocument, asset: MediaAsset, afterBlockId?: string | null): EditorDocument {
  /** 中文注释：把上传后的图片素材插入正文。 */
  const imageBlock: EditorBlock = {
    id: createId('image'),
    type: 'image',
    asset_id: asset.id,
    url: asset.file_url ?? null,
    width: asset.width ?? null,
    height: asset.height ?? null,
    alt: asset.original_filename,
    children: [],
  };
  const normalized = normalizeEditorDocument(document);
  const nextBlocks: EditorBlock[] = [];
  let inserted = false;
  normalized.blocks.forEach((block) => {
    nextBlocks.push(block);
    if (block.id === afterBlockId) {
      nextBlocks.push(imageBlock);
      inserted = true;
    }
  });
  if (!inserted) nextBlocks.push(imageBlock);
  return { type: 'doc', blocks: nextBlocks };
}

export function collectDocumentAssetIds(document: EditorDocument): string[] {
  /** 中文注释：从正文图片节点中提取素材引用，便于和接口同步。 */
  const ids: string[] = [];
  normalizeEditorDocument(document).blocks.forEach((block) => {
    if (block.type !== 'image') return;
    const assetId = block.asset_id?.trim();
    if (assetId && !ids.includes(assetId)) ids.push(assetId);
  });
  return ids;
}

export function applyAiPatch(document: EditorDocument, patch: FragmentAiPatch): EditorDocument {
  /** 中文注释：把后端 AI patch 应用到本地文档。 */
  const normalized = normalizeEditorDocument(document);
  if (patch.op === 'prepend_heading' && patch.block) {
    return { type: 'doc', blocks: [patch.block, ...normalized.blocks] };
  }
  if (patch.op === 'insert_after_selection') {
    const blocks = patch.blocks ?? [];
    return {
      type: 'doc',
      blocks: insertAfterTarget(normalized.blocks, patch.target_block_id ?? null, blocks),
    };
  }
  if (patch.op === 'replace_selection') {
    return {
      type: 'doc',
      blocks: normalized.blocks.map((block) => {
        if (block.id !== patch.target_block_id || block.type === 'image') return block;
        const firstChild = block.children[0] ?? { text: '', marks: [] };
        return {
          ...block,
          children: [{ text: patch.replacement_text ?? '', marks: firstChild.marks }],
        };
      }),
    };
  }
  return normalized;
}

function insertAfterTarget(blocks: EditorBlock[], targetBlockId: string | null, insertion: EditorBlock[]): EditorBlock[] {
  /** 中文注释：在指定块后插入一组新块，找不到时追加到末尾。 */
  if (!targetBlockId) return [...blocks, ...insertion];
  const nextBlocks: EditorBlock[] = [];
  let inserted = false;
  blocks.forEach((block) => {
    nextBlocks.push(block);
    if (block.id === targetBlockId) {
      nextBlocks.push(...insertion);
      inserted = true;
    }
  });
  if (!inserted) nextBlocks.push(...insertion);
  return nextBlocks;
}
