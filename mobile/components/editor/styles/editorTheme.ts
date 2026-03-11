import type { AppTheme } from '@/theme/tokens';

/**
 * 中文注释：编辑器主题配置接口，定义编辑器所需的颜色和排版变量。
 */
export interface EditorTheme {
  background: string;
  surface: string;
  text: string;
  textMuted: string;
  border: string;
  primary: string;
  primaryText: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
}

/**
 * 中文注释：从应用主题映射编辑器主题，供 DOM 层和原生层共用。
 */
export function createEditorTheme(theme: AppTheme): EditorTheme {
  return {
    background: theme.colors.surface,
    surface: theme.colors.surface,
    text: theme.colors.text,
    textMuted: theme.colors.textSubtle,
    border: theme.colors.border,
    primary: theme.colors.primary,
    primaryText: '#FFFFFF',
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", sans-serif',
    fontSize: 16,
    lineHeight: 1.7,
  };
}

/**
 * 中文注释：生成 CSS 变量字符串，供 DOM 层编辑器注入到 :root。
 */
export function createEditorCssVars(theme: AppTheme): string {
  const editorTheme = createEditorTheme(theme);
  return `
    --editor-background: ${editorTheme.background};
    --editor-surface: ${editorTheme.surface};
    --editor-text: ${editorTheme.text};
    --editor-text-muted: ${editorTheme.textMuted};
    --editor-border: ${editorTheme.border};
    --editor-primary: ${editorTheme.primary};
    --editor-primary-text: ${editorTheme.primaryText};
    --editor-font-family: ${editorTheme.fontFamily};
    --editor-font-size: ${editorTheme.fontSize}px;
    --editor-line-height: ${editorTheme.lineHeight};
  `.trim().replace(/\s+/g, ' ');
}

/**
 * 中文注释：生成编辑器基础 CSS，使用 CSS 变量实现主题切换。
 */
export function createEditorBaseCss(): string {
  return `
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--editor-background); color: var(--editor-text); font-family: var(--editor-font-family); }
    .ProseMirror {
      min-height: 260px;
      padding: 16px 16px 24px;
      outline: none;
      font-size: var(--editor-font-size);
      line-height: var(--editor-line-height);
      color: var(--editor-text);
    }
    .ProseMirror p { margin: 0 0 12px; }
    .ProseMirror h1 { margin: 0 0 16px; font-size: 28px; line-height: 1.25; }
    .ProseMirror blockquote {
      margin: 0 0 12px;
      padding-left: 14px;
      border-left: 3px solid var(--editor-primary);
      color: var(--editor-text-muted);
    }
    .ProseMirror ul, .ProseMirror ol {
      margin: 0 0 12px;
      padding-left: 24px;
    }
    .ProseMirror img {
      max-width: 100%;
      border-radius: 12px;
      display: block;
      margin: 12px 0;
    }
  `.trim().replace(/\s+/g, ' ');
}

/**
 * 中文注释：生成工具栏按钮样式，使用 CSS 变量。
 */
export function createToolbarButtonCss(): string {
  return `
    .editor-toolbar {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      padding: 12px 12px 0;
      border-bottom: 1px solid var(--editor-border);
      background: var(--editor-background);
      position: sticky;
      top: 0;
      z-index: 2;
    }
    .editor-toolbar button {
      appearance: none;
      border: none;
      border-radius: 999px;
      padding: 8px 12px;
      font-size: 12px;
      font-weight: 600;
      color: var(--editor-text);
      background: var(--editor-surface);
      cursor: pointer;
    }
    .editor-toolbar button.active {
      color: var(--editor-primary-text);
      background: var(--editor-primary);
    }
  `.trim().replace(/\s+/g, ' ');
}
