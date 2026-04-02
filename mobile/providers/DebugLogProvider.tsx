import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { STORAGE_KEYS, getBackendUrl } from '@/constants/config';
import {
  createDebugLogEntry,
  emitDebugLog,
  type DebugLogEntry,
  registerDebugLogSink,
  serializeForLog,
} from '@/features/debug-log/store';

interface DebugLogContextValue {
  logs: DebugLogEntry[];
  isReady: boolean;
  addLog: (entry: Omit<DebugLogEntry, 'id' | 'timestamp'>) => void;
  clearLogs: () => Promise<void>;
}

const MAX_LOG_ENTRIES = 200;
const DEBUG_LOG_ENDPOINT = '/api/debug/mobile-logs';
const DebugLogContext = createContext<DebugLogContextValue | null>(null);

async function syncDebugLogToBackend(entry: DebugLogEntry): Promise<void> {
  /*日志上报请求读取安全存储中的 token，避免依赖明文缓存。 */
  try {
    const [baseUrl, token] = await Promise.all([
      getBackendUrl(),
      SecureStore.getItemAsync(STORAGE_KEYS.TOKEN),
    ]);
    if (!token) {
      return;
    }

    await fetch(`${baseUrl}${DEBUG_LOG_ENDPOINT}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        timestamp: entry.timestamp,
        level: entry.level,
        source: entry.source,
        message: entry.message,
        context: entry.context ?? null,
      }),
    });
  } catch {
    // Keep local logs even if backend sync fails.
  }
}

export function DebugLogProvider({ children }: { children: React.ReactNode }) {
  const [logs, setLogs] = useState<DebugLogEntry[]>([]);
  const [isReady, setIsReady] = useState(false);
  const logsRef = useRef<DebugLogEntry[]>([]);

  useEffect(() => {
    logsRef.current = logs;
  }, [logs]);

  useEffect(() => {
    let disposed = false;

    const bootstrap = async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEYS.DEBUG_LOGS);
        if (!raw || disposed) {
          return;
        }
        const parsed = JSON.parse(raw) as DebugLogEntry[];
        if (Array.isArray(parsed)) {
          setLogs(parsed);
        }
      } catch {
        // Ignore corrupted local log cache.
      } finally {
        if (!disposed) {
          setIsReady(true);
        }
      }
    };

    void bootstrap();

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (!isReady) {
      return;
    }
    void AsyncStorage.setItem(STORAGE_KEYS.DEBUG_LOGS, JSON.stringify(logs)).catch(() => {
      // Best effort persistence only.
    });
  }, [isReady, logs]);

  useEffect(() => {
    const unregisterSink = registerDebugLogSink((entry) => {
      setLogs((current) => [entry, ...current].slice(0, MAX_LOG_ENTRIES));
      void syncDebugLogToBackend(entry);
    });

    const originalConsoleError = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      originalConsoleError(...args);
      emitDebugLog(
        createDebugLogEntry({
          level: 'error',
          source: 'console.error',
          message: args[0] ?? 'console.error',
          context: { args: serializeForLog(args.slice(1)) as Record<string, unknown> },
        })
      );
    };

    const globalScope = globalThis as typeof globalThis & {
      ErrorUtils?: {
        getGlobalHandler?: () => (error: Error, isFatal?: boolean) => void;
        setGlobalHandler?: (handler: (error: Error, isFatal?: boolean) => void) => void;
      };
    };
    const previousGlobalHandler = globalScope.ErrorUtils?.getGlobalHandler?.();

    if (globalScope.ErrorUtils?.setGlobalHandler) {
      globalScope.ErrorUtils.setGlobalHandler((error, isFatal) => {
        emitDebugLog(
          createDebugLogEntry({
            level: 'error',
            source: 'global-error',
            message: error,
            context: { isFatal: Boolean(isFatal) },
          })
        );
        previousGlobalHandler?.(error, isFatal);
      });
    }

    return () => {
      unregisterSink();
      console.error = originalConsoleError;
      if (globalScope.ErrorUtils?.setGlobalHandler && previousGlobalHandler) {
        globalScope.ErrorUtils.setGlobalHandler(previousGlobalHandler);
      }
    };
  }, []);

  const value = useMemo<DebugLogContextValue>(
    () => ({
      logs,
      isReady,
      addLog: (entry) => {
        emitDebugLog(createDebugLogEntry(entry));
      },
      clearLogs: async () => {
        setLogs([]);
        logsRef.current = [];
        await AsyncStorage.removeItem(STORAGE_KEYS.DEBUG_LOGS);
      },
    }),
    [isReady, logs]
  );

  return <DebugLogContext.Provider value={value}>{children}</DebugLogContext.Provider>;
}

export function useDebugLogs() {
  const context = useContext(DebugLogContext);
  if (!context) {
    throw new Error('useDebugLogs must be used within DebugLogProvider');
  }
  return context;
}
