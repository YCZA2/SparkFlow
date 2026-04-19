import React from 'react';
import { BlurView } from 'expo-blur';
import MaskedView from '@react-native-masked-view/masked-view';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export const NOTES_LIST_TOP_FADE_EXTRA = 96;
export const NOTES_LIST_QUICK_ACTION_FADE_EXTRA = 92;
export const NOTES_LIST_QUICK_ACTION_PADDING_EXTRA = 152;
export const NOTES_LIST_SELECTION_FADE_EXTRA = 124;
export const NOTES_LIST_SELECTION_PADDING_EXTRA = 184;

function FadeMaskedBlur({
  direction,
  tint,
  intensity,
  backgroundColor,
}: {
  direction: 'top' | 'bottom';
  tint: 'light' | 'dark' | 'default';
  intensity: number;
  backgroundColor: string;
}) {
  /*用渐变遮罩 BlurView，让列表边缘的模糊强度真正平滑过渡。 */
  const isTop = direction === 'top';
  const maskColors = isTop
    ? (['rgba(0,0,0,1)', 'rgba(0,0,0,1)', 'rgba(0,0,0,0)'] as const)
    : (['rgba(0,0,0,0)', 'rgba(0,0,0,1)', 'rgba(0,0,0,1)'] as const);
  const maskLocations = isTop ? ([0, 0.38, 1] as const) : ([0, 0.62, 1] as const);
  const overlayColors = isTop
    ? ([`${backgroundColor}D8`, `${backgroundColor}96`, `${backgroundColor}36`, `${backgroundColor}00`] as const)
    : ([`${backgroundColor}00`, `${backgroundColor}2C`, `${backgroundColor}9E`, `${backgroundColor}E8`] as const);
  const overlayLocations = isTop ? ([0, 0.24, 0.6, 1] as const) : ([0, 0.34, 0.72, 1] as const);

  return (
    <MaskedView
      style={styles.absoluteFill}
      maskElement={(
        <LinearGradient
          colors={maskColors}
          locations={maskLocations}
          style={styles.absoluteFill}
        />
      )}
    >
      <BlurView tint={tint} intensity={intensity} style={styles.absoluteFill} />
      <LinearGradient
        colors={overlayColors}
        locations={overlayLocations}
        style={styles.absoluteFill}
      />
    </MaskedView>
  );
}

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
          <FadeMaskedBlur
            direction="top"
            tint={blurTint}
            intensity={20}
            backgroundColor={backgroundColor}
          />
        </View>
      ) : null}

      {bottomFadeHeight > 0 ? (
        <View
          className="absolute bottom-0 left-0 right-0 overflow-hidden"
          style={{ height: bottomFadeHeight, zIndex: 8 }}
          pointerEvents="none"
        >
          <FadeMaskedBlur
            direction="bottom"
            tint={blurTint}
            intensity={24}
            backgroundColor={backgroundColor}
          />
        </View>
      ) : null}

      {bottomOverlay}
    </View>
  );
}

const styles = StyleSheet.create({
  absoluteFill: {
    ...StyleSheet.absoluteFillObject,
  },
});
