import type { AppTheme } from '@/theme/tokens';

/**
 编辑器主题配置接口，定义编辑器所需的颜色和排版变量。
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
 从应用主题映射编辑器主题，供 DOM 层和原生层共用。
 */
export function createEditorTheme(theme: AppTheme): EditorTheme {
  return {
    background: theme.name === 'dark' ? '#12110F' : '#ECE9E4',
    surface: theme.name === 'dark' ? '#181715' : '#ECE9E4',
    text: theme.name === 'dark' ? '#F7F3ED' : '#35312C',
    textMuted: theme.name === 'dark' ? '#A8A097' : '#7C756D',
    border: theme.name === 'dark' ? '#2A2723' : '#E7E1D8',
    primary: theme.name === 'dark' ? '#E0BB48' : '#D8B23C',
    primaryText: '#FFFFFF',
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", sans-serif',
    fontSize: 18,
    lineHeight: 1.78,
  };
}

/**
 生成 CSS 变量字符串，供 DOM 层编辑器注入到 :root。
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
 生成编辑器基础 CSS，使用 CSS 变量实现主题切换。
 */
export function createEditorBaseCss(): string {
  return `
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; background: transparent; color: var(--editor-text); font-family: var(--editor-font-family); }
    .ProseMirror {
      min-height: 360px;
      padding: 8px 0 180px;
      outline: none;
      font-size: var(--editor-font-size);
      line-height: var(--editor-line-height);
      color: var(--editor-text);
      caret-color: var(--editor-primary);
      word-break: break-word;
    }
    .ProseMirror p {
      margin: 0 0 18px;
      letter-spacing: 0.1px;
    }
    .ProseMirror h1 {
      margin: 0 0 28px;
      font-size: 34px;
      line-height: 1.18;
      font-weight: 800;
      letter-spacing: -0.6px;
    }
    .ProseMirror blockquote {
      margin: 0 0 18px;
      padding: 2px 0 2px 16px;
      border-left: 3px solid var(--editor-primary);
      color: var(--editor-text-muted);
    }
    .ProseMirror ul, .ProseMirror ol {
      margin: 0 0 18px;
      padding-left: 24px;
    }
    .ProseMirror li { margin: 0 0 8px; }
    .ProseMirror strong { font-weight: 760; }
    .ProseMirror em { font-style: italic; }
    .ProseMirror img {
      max-width: 100%;
      border-radius: 20px;
      display: block;
      margin: 18px 0;
      box-shadow: 0 14px 36px rgba(36, 31, 26, 0.1);
    }
  `.trim().replace(/\s+/g, ' ');
}
