export type DebugLogLevel = 'error' | 'warn' | 'info';

export interface DebugLogEntry {
  id: string;
  timestamp: string;
  level: DebugLogLevel;
  source: string;
  message: string;
  context?: Record<string, unknown>;
}

type DebugLogSink = (entry: DebugLogEntry) => void;

const pendingEntries: DebugLogEntry[] = [];
let activeSink: DebugLogSink | null = null;

function normalizeMessage(message: unknown): string {
  if (typeof message === 'string') {
    return message;
  }
  if (message instanceof Error) {
    return `${message.name}: ${message.message}`;
  }
  try {
    return JSON.stringify(message);
  } catch {
    return String(message);
  }
}

export function serializeForLog(value: unknown, depth = 0): unknown {
  if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }
  if (Array.isArray(value)) {
    if (depth >= 2) {
      return `[array(${value.length})]`;
    }
    return value.slice(0, 10).map((item) => serializeForLog(item, depth + 1));
  }
  if (typeof value === 'object') {
    if (depth >= 2) {
      return '[object]';
    }
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 20);
    return Object.fromEntries(entries.map(([key, item]) => [key, serializeForLog(item, depth + 1)]));
  }
  return String(value);
}

export function createDebugLogEntry(input: {
  level: DebugLogLevel;
  source: string;
  message: unknown;
  context?: Record<string, unknown>;
}): DebugLogEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    level: input.level,
    source: input.source,
    message: normalizeMessage(input.message),
    context: input.context ? (serializeForLog(input.context) as Record<string, unknown>) : undefined,
  };
}

export function emitDebugLog(entry: DebugLogEntry): void {
  if (activeSink) {
    activeSink(entry);
    return;
  }
  pendingEntries.push(entry);
}

export function registerDebugLogSink(sink: DebugLogSink): () => void {
  activeSink = sink;
  while (pendingEntries.length > 0) {
    const entry = pendingEntries.shift();
    if (entry) {
      sink(entry);
    }
  }
  return () => {
    if (activeSink === sink) {
      activeSink = null;
    }
  };
}
