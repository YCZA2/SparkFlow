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

const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
};

const layout = {
  screenPadding: 16,
  sectionGap: 24,
  heroGap: 12,
  cardGap: 12,
  bottomBarPadding: 16,
};

const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
};

export const themes: Record<ThemeName, AppTheme> = {
  light: {
    name: 'light',
    colors: {
      background: '#F2F2F7',
      surface: '#FFFFFF',
      surfaceMuted: '#F7F7FA',
      text: '#111111',
      textMuted: '#666666',
      textSubtle: '#8E8E93',
      border: '#E5E5EA',
      primary: '#007AFF',
      success: '#34C759',
      danger: '#FF3B30',
      warning: '#FF9500',
    },
    spacing,
    layout,
    radius,
    shadow: {
      card: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 2,
      },
    },
  },
  dark: {
    name: 'dark',
    colors: {
      background: '#000000',
      surface: '#1C1C1E',
      surfaceMuted: '#2C2C2E',
      text: '#FFFFFF',
      textMuted: '#D1D1D6',
      textSubtle: '#8E8E93',
      border: '#3A3A3C',
      primary: '#0A84FF',
      success: '#30D158',
      danger: '#FF453A',
      warning: '#FFD60A',
    },
    spacing,
    layout,
    radius,
    shadow: {
      card: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 6,
        elevation: 3,
      },
    },
  },
};
