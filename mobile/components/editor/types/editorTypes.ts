import type { EditorDocument, EditorNode, EditorMark, EditorNodeType } from '@/types/fragment';

/**
 * 中文注释：编辑器类型守卫和运行时验证工具。
 * 与 types/fragment.ts 中的类型定义配合使用，提供类型安全保障。
 */

// ============ 类型守卫 ============

/**
 * 中文注释：检查是否为有效的编辑器标记。
 */
export function isEditorMark(value: unknown): value is EditorMark {
  if (!value || typeof value !== 'object') return false;
  const mark = value as EditorMark;
  return mark.type === 'bold' || mark.type === 'italic';
}

/**
 * 中文注释：检查是否为有效的编辑器节点类型。
 */
export function isValidNodeType(type: unknown): type is EditorNodeType {
  const validTypes: EditorNodeType[] = [
    'doc', 'paragraph', 'heading', 'blockquote',
    'bulletList', 'orderedList', 'listItem',
    'text', 'image'
  ];
  return typeof type === 'string' && validTypes.includes(type as EditorNodeType);
}

/**
 * 中文注释：检查是否为有效的编辑器节点。
 */
export function isEditorNode(value: unknown): value is EditorNode {
  if (!value || typeof value !== 'object') return false;
  const node = value as EditorNode;
  if (!isValidNodeType(node.type)) return false;

  // 文本节点必须有 text 属性
  if (node.type === 'text') {
    return typeof node.text === 'string';
  }

  // 图片节点必须有 attrs.src
  if (node.type === 'image') {
    return Boolean(node.attrs && typeof (node.attrs as { src?: unknown }).src === 'string');
  }

  // 其他节点类型基本结构正确即可
  return true;
}

/**
 * 中文注释：检查是否为有效的编辑器文档。
 */
export function isEditorDocument(value: unknown): value is EditorDocument {
  if (!value || typeof value !== 'object') return false;
  const doc = value as EditorDocument;
  if (doc.type !== 'doc') return false;
  if (!Array.isArray(doc.content)) return false;
  return doc.content.every(isEditorNode);
}

/**
 * 中文注释：检查是否为真值（非 null/undefined）。
 */
function isTruthy<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * 中文注释：将 EditorNode 转换为 Tiptap 兼容的 JSONContent 格式。
 * 主要处理 attrs 中的 null 值，将其转换为 undefined。
 */
export function toTiptapContent(node: EditorNode): Record<string, unknown> {
  const result: Record<string, unknown> = { type: node.type };

  if (node.attrs && typeof node.attrs === 'object') {
    // 中文注释：过滤掉 null 值，Tiptap 期望 undefined 而非 null
    const attrs: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node.attrs)) {
      if (value !== null) {
        attrs[key] = value;
      }
    }
    result.attrs = attrs;
  }

  if (typeof node.text === 'string') {
    result.text = node.text;
  }

  if (Array.isArray(node.marks)) {
    result.marks = node.marks.filter(isTruthy);
  }

  if (Array.isArray(node.content)) {
    result.content = node.content.filter(isTruthy).map(toTiptapContent);
  }

  return result;
}

/**
 * 中文注释：将 EditorDocument 转换为 Tiptap 兼容的 JSONContent 格式。
 */
export function toTiptapDocument(document: EditorDocument): Record<string, unknown> {
  return {
    type: 'doc',
    content: document.content.filter(isTruthy).map(toTiptapContent),
  };
}

// ============ 节点类型细化 ============

/**
 * 中文注释：文本节点接口，细化 EditorNode 的文本类型。
 */
export interface TextNode {
  type: 'text';
  text: string;
  marks?: EditorMark[];
}

/**
 * 中文注释：检查是否为文本节点。
 */
export function isTextNode(node: EditorNode): node is TextNode {
  return node.type === 'text' && typeof node.text === 'string';
}

/**
 * 中文注释：图片节点属性接口。
 */
export interface ImageAttrs {
  src: string;
  alt?: string | null;
  assetId?: string | null;
  width?: number | null;
  height?: number | null;
  [key: string]: unknown; // 中文注释：添加索引签名以兼容 Record<string, unknown>
}

/**
 * 中文注释：图片节点接口。
 */
export interface ImageNode {
  type: 'image';
  attrs: ImageAttrs;
}

/**
 * 中文注释：检查是否为图片节点。
 */
export function isImageNode(node: EditorNode): node is ImageNode {
  return node.type === 'image' && !!node.attrs;
}

/**
 * 中文注释：标题节点接口。
 */
export interface HeadingNode {
  type: 'heading';
  attrs: { level: 1 };
  content?: EditorNode[];
}

/**
 * 中文注释：检查是否为标题节点。
 */
export function isHeadingNode(node: EditorNode): node is HeadingNode {
  return node.type === 'heading' && !!node.attrs;
}

/**
 * 中文注释：段落节点接口。
 */
export interface ParagraphNode {
  type: 'paragraph';
  content?: EditorNode[];
}

/**
 * 中文注释：检查是否为段落节点。
 */
export function isParagraphNode(node: EditorNode): node is ParagraphNode {
  return node.type === 'paragraph';
}

/**
 * 中文注释：引用节点接口。
 */
export interface BlockquoteNode {
  type: 'blockquote';
  content?: EditorNode[];
}

/**
 * 中文注释：检查是否为引用节点。
 */
export function isBlockquoteNode(node: EditorNode): node is BlockquoteNode {
  return node.type === 'blockquote';
}

/**
 * 中文注释：列表节点接口（无序列表或有序列表）。
 */
export interface ListNode {
  type: 'bulletList' | 'orderedList';
  content: EditorNode[];
}

/**
 * 中文注释：检查是否为列表节点。
 */
export function isListNode(node: EditorNode): node is ListNode {
  return node.type === 'bulletList' || node.type === 'orderedList';
}

// ============ 文档验证和规范化 ============

/**
 * 中文注释：验证结果接口。
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * 中文注释：验证编辑器文档结构，返回详细错误信息。
 */
export function validateDocument(document: unknown): ValidationResult {
  const errors: string[] = [];

  if (!document || typeof document !== 'object') {
    errors.push('Document must be an object');
    return { valid: false, errors };
  }

  const doc = document as Record<string, unknown>;

  if (doc.type !== 'doc') {
    errors.push(`Document type must be "doc", got "${doc.type}"`);
  }

  if (!Array.isArray(doc.content)) {
    errors.push('Document content must be an array');
    return { valid: false, errors };
  }

  (doc.content as unknown[]).forEach((node, index) => {
    if (!isEditorNode(node)) {
      errors.push(`Invalid node at index ${index}`);
    }
  });

  return { valid: errors.length === 0, errors };
}

/**
 * 中文注释：安全地获取文档，如果无效则返回空文档。
 */
export function safeGetDocument(document: unknown): EditorDocument {
  if (isEditorDocument(document)) {
    return document;
  }
  return { type: 'doc', content: [] };
}

/**
 * 中文注释：规范化编辑器节点，移除无效字段。
 */
export function normalizeNode(node: EditorNode): EditorNode {
  const normalized: EditorNode = { type: node.type };

  if (node.attrs && typeof node.attrs === 'object') {
    normalized.attrs = { ...node.attrs };
  }

  if (typeof node.text === 'string') {
    normalized.text = node.text;
  }

  if (Array.isArray(node.marks)) {
    normalized.marks = node.marks
      .filter(isEditorMark)
      .map(mark => ({ type: mark.type }));
  }

  if (Array.isArray(node.content)) {
    normalized.content = node.content
      .filter(isEditorNode)
      .map(normalizeNode);
  } else if (node.type !== 'text' && node.type !== 'image') {
    normalized.content = [];
  }

  return normalized;
}

/**
 * 中文注释：规范化整个文档，确保结构有效。
 */
export function normalizeDocument(document: EditorDocument | null | undefined): EditorDocument {
  if (!document || document.type !== 'doc') {
    return { type: 'doc', content: [] };
  }

  const content = Array.isArray(document.content)
    ? document.content.filter(isEditorNode).map(normalizeNode)
    : [];

  return { type: 'doc', content };
}