import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

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
}: {
  backgroundColor: string;
  overlay?: React.ReactNode;
  bottomOverlay?: React.ReactNode;
  topFadeHeight?: number;
  bottomFadeHeight?: number;
  children: React.ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
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
        <LinearGradient
          colors={[backgroundColor, `${backgroundColor}00`]}
          locations={[0.18, 1]}
          className="absolute left-0 right-0 top-0"
          style={{ height: topFadeHeight, zIndex: 8 }}
          pointerEvents="none"
        />
      ) : null}

      {bottomFadeHeight > 0 ? (
        <LinearGradient
          colors={[`${backgroundColor}00`, backgroundColor]}
          locations={[0, 0.78]}
          className="absolute bottom-0 left-0 right-0"
          style={{ height: bottomFadeHeight, zIndex: 8 }}
          pointerEvents="none"
        />
      ) : null}

      {bottomOverlay}
    </View>
  );
}
