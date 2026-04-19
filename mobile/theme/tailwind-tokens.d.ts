export interface SparkFlowThemeColors {
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

export interface SparkFlowTheme {
  colors: {
    light: SparkFlowThemeColors;
    dark: SparkFlowThemeColors;
  };
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    screen: number;
    section: number;
    hero: number;
    card: number;
    bottomBar: number;
  };
  radius: {
    sm: number;
    md: number;
    lg: number;
    card: number;
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
    cardDark: {
      shadowColor: string;
      shadowOffset: { width: number; height: number };
      shadowOpacity: number;
      shadowRadius: number;
      elevation: number;
    };
  };
}

export const sparkFlowTheme: SparkFlowTheme;
export const tailwindThemeExtension: Record<string, unknown>;
