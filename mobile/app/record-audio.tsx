import React from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';

import { RecordAudioScreen } from '@/features/recording/components/RecordAudioScreen';

export default function RecordAudioRoute() {
  const { folderId } = useLocalSearchParams<{ folderId?: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <RecordAudioScreen folderId={folderId} />
    </>
  );
}
