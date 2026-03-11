import React from 'react';
import Markdown from 'react-native-markdown-display';

import type { useAppTheme } from '@/theme/useAppTheme';

interface MarkdownRendererProps {
  markdown: string;
  theme: ReturnType<typeof useAppTheme>;
  enableLinks?: boolean;
}

export function MarkdownRenderer({
  markdown,
  theme,
  enableLinks = true,
}: MarkdownRendererProps) {
  /** 中文注释：统一渲染 Markdown 正文，避免脚本详情页直接耦合第三方组件。 */
  return (
    <Markdown
      mergeStyle
      onLinkPress={enableLinks ? undefined : () => false}
      style={{
        body: {
          color: theme.colors.text,
          fontSize: 16,
          lineHeight: 26,
        },
        heading1: {
          color: theme.colors.text,
          fontSize: 26,
          lineHeight: 32,
          fontWeight: '700',
          marginBottom: 12,
        },
        paragraph: {
          marginTop: 0,
          marginBottom: 12,
        },
        bullet_list: {
          marginBottom: 12,
        },
        ordered_list: {
          marginBottom: 12,
        },
        blockquote: {
          borderLeftColor: theme.colors.border,
          borderLeftWidth: 3,
          paddingLeft: 12,
          color: theme.colors.textSubtle,
        },
      }}
    >
      {markdown}
    </Markdown>
  );
}
