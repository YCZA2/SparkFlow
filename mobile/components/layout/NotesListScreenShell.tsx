import React from 'react';
import { BlurView } from 'expo-blur';
import { StyleProp, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export const NOTES_LIST_TOP_FADE_EXTRA = 96;
export const NOTES_LIST_QUICK_ACTION_FADE_EXTRA = 92;
export const NOTES_LIST_QUICK_ACTION_PADDING_EXTRA = 152;
export const NOTES_LIST_SELECTION_FADE_EXTRA = 124;
export const NOTES_LIST_SELECTION_PADDING_EXTRA = 184;

/*统一承载 notes 风格列表页的背景、浮层和渐隐壳层，不接管业务数据流。 */
export function NotesListScreenShell({
  backgroundColor,
  overlay,
  bottomOverlay,
  topFadeHeight = 0,
  bottomFadeHeight = 0,
  children,
  className,
  style,
  blurTint = 'light',
}: {
  backgroundColor: string;
  overlay?: React.ReactNode;
  bottomOverlay?: React.ReactNode;
  topFadeHeight?: number;
  bottomFadeHeight?: number;
  children: React.ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
  blurTint?: 'light' | 'dark' | 'default';
}) {
  return (
    <View className={`flex-1 ${className ?? ''}`} style={[{ backgroundColor }, style]}>
      {overlay ? (
        <View pointerEvents="box-none" className="absolute inset-0 z-10">
          {overlay}
        </View>
      ) : null}

      {children}

      {topFadeHeight > 0 ? (
        <View
          className="absolute left-0 right-0 top-0 overflow-hidden"
          style={{ height: topFadeHeight, zIndex: 8 }}
          pointerEvents="none"
        >
          <BlurView
            tint={blurTint}
            intensity={22}
            className="absolute inset-0"
          />
          <LinearGradient
            colors={[`${backgroundColor}F7`, `${backgroundColor}D6`, `${backgroundColor}70`, `${backgroundColor}00`]}
            locations={[0, 0.26, 0.58, 1]}
            className="absolute inset-0"
          />
        </View>
      ) : null}

      {bottomFadeHeight > 0 ? (
        <View
          className="absolute bottom-0 left-0 right-0 overflow-hidden"
          style={{ height: bottomFadeHeight, zIndex: 8 }}
          pointerEvents="none"
        >
          <BlurView
            tint={blurTint}
            intensity={28}
            className="absolute inset-0"
          />
          <LinearGradient
            colors={[`${backgroundColor}00`, `${backgroundColor}78`, `${backgroundColor}D8`, `${backgroundColor}FA`]}
            locations={[0, 0.34, 0.72, 1]}
            className="absolute inset-0"
          />
        </View>
      ) : null}

      {bottomOverlay}
    </View>
  );
}
