import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

/*统一承载 notes 风格列表页的背景、浮层和渐隐壳层，不接管业务数据流。 */
export function NotesListScreenShell({
  backgroundColor,
  overlay,
  bottomOverlay,
  topFadeHeight = 0,
  bottomFadeHeight = 0,
  children,
}: {
  backgroundColor: string;
  overlay?: React.ReactNode;
  bottomOverlay?: React.ReactNode;
  topFadeHeight?: number;
  bottomFadeHeight?: number;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.container, { backgroundColor }]}>
      {overlay ? (
        <View pointerEvents="box-none" style={styles.overlay}>
          {overlay}
        </View>
      ) : null}

      {children}

      {topFadeHeight > 0 ? (
        <LinearGradient
          colors={[backgroundColor, `${backgroundColor}00`]}
          locations={[0.18, 1]}
          style={[styles.topFade, { height: topFadeHeight }]}
          pointerEvents="none"
        />
      ) : null}

      {bottomFadeHeight > 0 ? (
        <LinearGradient
          colors={[`${backgroundColor}00`, backgroundColor]}
          locations={[0, 0.78]}
          style={[styles.bottomFade, { height: bottomFadeHeight }]}
          pointerEvents="none"
        />
      ) : null}

      {bottomOverlay}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },
  topFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 8,
  },
  bottomFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 8,
  },
});
