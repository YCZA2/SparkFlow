import { parseDocument } from 'htmlparser2';

const ASSET_PREFIX = 'asset://';
const BLOCK_TAGS = new Set(['p', 'blockquote', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const TITLE_TAGS = new Set(['h1']);
const PREVIEW_STRIPPABLE_TAGS = new Set(['h1', 'p']);

type DomNode = {
  type?: string;
  name?: string;
  data?: string;
  children?: DomNode[];
  attribs?: Record<string, string>;
};

export interface ContentBodyService {
  extractPlainText: (html: string | null | undefined) => string;
  extractTitle: (html: string | null | undefined, maxTitleLength?: number) => string;
  extractPreview: (html: string | null | undefined, maxPreviewLength?: number) => string;
  collectAssetIds: (html: string | null | undefined) => string[];
}

function normalizeHtml(html: string | null | undefined): string {
  return String(html ?? '').replace(/\r\n/g, '\n').trim();
}

function parseHtmlDocument(html: string): DomNode[] {
  const document = parseDocument(html, { decodeEntities: true });
  return flattenDocumentChildren(document.children as DomNode[]);
}

function flattenDocumentChildren(nodes: DomNode[]): DomNode[] {
  const flattened: DomNode[] = [];
  for (const node of nodes) {
    if (isElementNode(node) && (node.name === 'html' || node.name === 'body')) {
      flattened.push(...flattenDocumentChildren(node.children ?? []));
      continue;
    }
    flattened.push(node);
  }
  return flattened;
}

function isElementNode(node: DomNode | null | undefined): boolean {
  return Boolean(node?.type === 'tag' || node?.type === 'script' || node?.type === 'style');
}

function isTextNode(node: DomNode | null | undefined): boolean {
  return Boolean(node?.type === 'text');
}

function extractPlainTextFromNodes(nodes: DomNode[]): string {
  const parts: string[] = [];
  for (const node of nodes) {
    appendPlainText(node, parts);
  }
  return parts.join('').replace(/\s+/g, ' ').trim();
}

function appendPlainText(node: DomNode, parts: string[]): void {
  if (isTextNode(node)) {
    parts.push(node.data ?? '');
    return;
  }

  if (!isElementNode(node)) {
    for (const child of node.children ?? []) {
      appendPlainText(child, parts);
    }
    return;
  }

  const tagName = String(node.name ?? '').toLowerCase();
  if (tagName === 'img') {
    parts.push(' ');
    return;
  }
  if (tagName === 'br') {
    parts.push('\n');
    return;
  }
  if (BLOCK_TAGS.has(tagName)) {
    parts.push('\n');
  }
  for (const child of node.children ?? []) {
    appendPlainText(child, parts);
  }
  if (BLOCK_TAGS.has(tagName)) {
    parts.push('\n');
  }
}

function getLeadingRenderableNodes(html: string): DomNode[] {
  return parseHtmlDocument(html).filter((node) => {
    if (isTextNode(node)) {
      return Boolean(node.data?.trim());
    }
    if (!isElementNode(node)) {
      return false;
    }
    return tagHasMeaningfulText(node) || String(node.name ?? '').toLowerCase() === 'img';
  });
}

function tagHasMeaningfulText(node: DomNode): boolean {
  return extractPlainTextFromNodes([node]).length > 0;
}

function extractNodePlainText(node: DomNode, maxLength?: number): string {
  const text = extractPlainTextFromNodes([node]);
  if (!maxLength) {
    return text;
  }
  return text.slice(0, maxLength);
}

function collectAssetIdsFromNodes(nodes: DomNode[]): string[] {
  const assetIds: string[] = [];
  for (const node of nodes) {
    visitNodes(node, (current) => {
      if (!isElementNode(current) || String(current.name ?? '').toLowerCase() !== 'img') {
        return;
      }
      const src = String(current.attribs?.src ?? '').trim();
      if (!src.startsWith(ASSET_PREFIX)) {
        return;
      }
      const assetId = src.slice(ASSET_PREFIX.length).trim();
      if (assetId && !assetIds.includes(assetId)) {
        assetIds.push(assetId);
      }
    });
  }
  return assetIds;
}

function visitNodes(node: DomNode, visitor: (node: DomNode) => void): void {
  visitor(node);
  for (const child of node.children ?? []) {
    visitNodes(child, visitor);
  }
}

export const contentBodyService: ContentBodyService = {
  extractPlainText(html) {
    const normalized = normalizeHtml(html);
    if (!normalized) {
      return '';
    }
    return extractPlainTextFromNodes(parseHtmlDocument(normalized));
  },
  extractTitle(html, maxTitleLength = 50) {
    const normalized = normalizeHtml(html);
    if (!normalized) {
      return '';
    }

    const leadingNodes = getLeadingRenderableNodes(normalized);
    const firstNode = leadingNodes[0];
    if (firstNode && isElementNode(firstNode) && TITLE_TAGS.has(String(firstNode.name ?? '').toLowerCase())) {
      return extractNodePlainText(firstNode, maxTitleLength);
    }
    if (firstNode && isElementNode(firstNode) && String(firstNode.name ?? '').toLowerCase() === 'p') {
      return extractNodePlainText(firstNode, maxTitleLength);
    }
    return this.extractPlainText(normalized).slice(0, maxTitleLength);
  },
  extractPreview(html, maxPreviewLength = 100) {
    const normalized = normalizeHtml(html);
    if (!normalized) {
      return '';
    }
    const leadingNodes = getLeadingRenderableNodes(normalized);
    if (leadingNodes.length === 0) {
      return '';
    }

    const [firstNode, ...restNodes] = leadingNodes;
    if (firstNode && isElementNode(firstNode) && PREVIEW_STRIPPABLE_TAGS.has(String(firstNode.name ?? '').toLowerCase())) {
      return extractPlainTextFromNodes(restNodes).slice(0, maxPreviewLength);
    }
    return extractPlainTextFromNodes(leadingNodes).slice(0, maxPreviewLength);
  },
  collectAssetIds(html) {
    const normalized = normalizeHtml(html);
    if (!normalized) {
      return [];
    }
    return collectAssetIdsFromNodes(parseHtmlDocument(normalized));
  },
};
