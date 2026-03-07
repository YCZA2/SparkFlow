import React, { createContext, useCallback, useContext, useMemo } from 'react';

import { useAudioRecorder, useAudioUpload } from '@/features/recording/hooks';

type RecorderStatus = 'idle' | 'recording' | 'paused' | 'recorded' | 'uploading';

interface AudioCaptureSessionValue {
  status: RecorderStatus;
  durationSeconds: number;
  durationLabel: string;
  recordedUri: string | null;
  uploadStatus: 'idle' | 'loading' | 'success' | 'error';
  uploadResult: ReturnType<typeof useAudioUpload>['result'];
  uploadError: string | null;
  isUploading: boolean;
  hasRecording: boolean;
  start: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  stopAndUpload: () => Promise<boolean>;
  cancel: () => Promise<void>;
  reset: () => void;
  retryUpload: () => Promise<void>;
  playRecording: () => Promise<void>;
}

const AudioCaptureContext = createContext<AudioCaptureSessionValue | null>(null);

export function AudioCaptureProvider({ children }: { children: React.ReactNode }) {
  const recorder = useAudioRecorder();
  const upload = useAudioUpload();

  const start = useCallback(async () => {
    upload.reset();
    await recorder.startRecording();
  }, [recorder, upload]);

  const pause = useCallback(() => {
    recorder.pauseRecording();
  }, [recorder]);

  const resume = useCallback(() => {
    recorder.resumeRecording();
  }, [recorder]);

  const stopAndUpload = useCallback(async () => {
    const uri = await recorder.stopRecording();
    if (!uri) {
      return false;
    }

    try {
      await upload.upload(uri);
      recorder.reset();
      return true;
    } catch {
      return false;
    }
  }, [recorder, upload]);

  const cancel = useCallback(async () => {
    if (recorder.status === 'recording' || recorder.status === 'paused') {
      await recorder.stopRecording();
    }
    upload.reset();
    recorder.reset();
  }, [recorder, upload]);

  const reset = useCallback(() => {
    upload.reset();
    recorder.reset();
  }, [recorder, upload]);

  const retryUpload = useCallback(async () => {
    if (!recorder.recordedUri) {
      return;
    }

    try {
      await upload.upload(recorder.recordedUri);
    } catch {
      // upload hook stores the error state for the UI
    }
  }, [recorder.recordedUri, upload]);

  const value = useMemo<AudioCaptureSessionValue>(
    () => ({
      status: upload.status === 'loading' ? 'uploading' : recorder.status,
      durationSeconds: recorder.durationSeconds,
      durationLabel: recorder.durationLabel,
      recordedUri: recorder.recordedUri,
      uploadStatus: upload.status,
      uploadResult: upload.result,
      uploadError: upload.error,
      isUploading: upload.status === 'loading',
      hasRecording: Boolean(recorder.recordedUri),
      start,
      pause,
      resume,
      stopAndUpload,
      cancel,
      reset,
      retryUpload,
      playRecording: recorder.playRecording,
    }),
    [pause, recorder, reset, retryUpload, start, stopAndUpload, upload]
  );

  return <AudioCaptureContext.Provider value={value}>{children}</AudioCaptureContext.Provider>;
}

export function useAudioCaptureSession() {
  const context = useContext(AudioCaptureContext);
  if (!context) {
    throw new Error('useAudioCaptureSession must be used within AudioCaptureProvider');
  }
  return context;
}
