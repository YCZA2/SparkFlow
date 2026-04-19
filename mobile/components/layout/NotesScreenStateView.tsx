import React from 'react';
import { View } from 'react-native';

/*统一 notes 风格列表页在 loading / error 态下的居中容器。 */
export function NotesScreenStateView({
  backgroundColor,
  children,
}: {
  backgroundColor: string;
  children: React.ReactNode;
}) {
  return (
    <View className="flex-1 justify-center" style={{ backgroundColor }}>
      {children}
    </View>
  );
}
