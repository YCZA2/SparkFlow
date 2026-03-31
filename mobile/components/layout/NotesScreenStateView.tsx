import React from 'react';
import { StyleSheet, View } from 'react-native';

/*统一 notes 风格列表页在 loading / error 态下的居中容器。 */
export function NotesScreenStateView({
  backgroundColor,
  children,
}: {
  backgroundColor: string;
  children: React.ReactNode;
}) {
  return <View style={[styles.container, { backgroundColor }]}>{children}</View>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
  },
});
