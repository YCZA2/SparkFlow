import { sparkFlowTheme } from './tailwind-tokens';

export type ThemeName = 'light' | 'dark';

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceMuted: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  border: string;
  primary: string;
  success: string;
  danger: string;
  warning: string;
}

export interface AppTheme {
  name: ThemeName;
  colors: ThemeColors;
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };
  layout: {
    screenPadding: number;
    sectionGap: number;
    heroGap: number;
    cardGap: number;
    bottomBarPadding: number;
  };
  radius: {
    sm: number;
    md: number;
    lg: number;
    pill: number;
  };
  shadow: {
    card: {
      shadowColor: string;
      shadowOffset: { width: number; height: number };
      shadowOpacity: number;
      shadowRadius: number;
      elevation: number;
    };
  };
}

const spacing = sparkFlowTheme.spacing;

const layout = {
  screenPadding: sparkFlowTheme.spacing.screen,
  sectionGap: sparkFlowTheme.spacing.section,
  heroGap: sparkFlowTheme.spacing.hero,
  cardGap: sparkFlowTheme.spacing.card,
  bottomBarPadding: sparkFlowTheme.spacing.bottomBar,
};

const radius = sparkFlowTheme.radius;

/*服务仍在迁移中的 StyleSheet 调用；新增视觉 token 应优先进入 Tailwind theme。 */
export const themes: Record<ThemeName, AppTheme> = {
  light: {
    name: 'light',
    colors: sparkFlowTheme.colors.light,
    spacing,
    layout,
    radius,
    shadow: {
      card: sparkFlowTheme.shadow.card,
    },
  },
  dark: {
    name: 'dark',
    colors: sparkFlowTheme.colors.dark,
    spacing,
    layout,
    radius,
    shadow: {
      card: sparkFlowTheme.shadow.cardDark,
    },
  },
};
