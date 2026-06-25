import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type { LogEntry, LogLevel } from '@/types';

interface ConsoleState {
  logs: LogEntry[];
  /** When true, log() collapses consecutive identical messages into a count. */
  collapse: boolean;
  /** When true, logs are saved to localStorage and survive page reloads. */
  persist: boolean;
  filter: Record<LogLevel, boolean>;
  push: (level: LogLevel, source: string, args: unknown[]) => void;
  clear: () => void;
  setCollapse: (v: boolean) => void;
  setPersist: (v: boolean) => void;
  toggleFilter: (level: LogLevel) => void;
}

const MAX_LOGS = 500;
const PERSIST_KEY = 'console.persist';
const LOGS_KEY = 'console.logs';

function loadPersist(): boolean {
  try {
    return localStorage.getItem(PERSIST_KEY) === '1';
  } catch {
    return false;
  }
}

function loadLogs(persist: boolean): LogEntry[] {
  if (!persist) return [];
  try {
    const raw = localStorage.getItem(LOGS_KEY);
    const arr = raw ? JSON.parse(raw) : null;
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveLogs(logs: LogEntry[]): void {
  try {
    localStorage.setItem(LOGS_KEY, JSON.stringify(logs));
  } catch {
    /* quota / unavailable — persistence is best-effort */
  }
}

function format(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
  try {
    return JSON.stringify(arg, (_k, v) => (typeof v === 'function' ? '[fn]' : v));
  } catch {
    return String(arg);
  }
}

const initialPersist = loadPersist();

export const useConsoleStore = create<ConsoleState>((set, get) => ({
  logs: loadLogs(initialPersist),
  collapse: true,
  persist: initialPersist,
  filter: { log: true, info: true, warn: true, error: true, debug: true },
  push: (level, source, args) => {
    const message = args.map(format).join(' ');
    set((state) => {
      const last = state.logs[state.logs.length - 1];
      if (state.collapse && last && last.level === level && last.message === message && last.source === source) {
        const logs = state.logs.slice();
        logs[logs.length - 1] = { ...last, count: last.count + 1, time: Date.now() };
        if (state.persist) saveLogs(logs);
        return { logs };
      }
      const entry: LogEntry = {
        id: nanoid(6),
        level,
        message,
        source,
        time: Date.now(),
        count: 1,
      };
      const logs = [...state.logs, entry];
      if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS);
      if (state.persist) saveLogs(logs);
      return { logs };
    });
  },
  clear: () => {
    if (get().persist) saveLogs([]);
    set({ logs: [] });
  },
  setCollapse: (v) => set({ collapse: v }),
  setPersist: (v) => {
    try {
      if (v) {
        localStorage.setItem(PERSIST_KEY, '1');
        saveLogs(get().logs);
      } else {
        localStorage.removeItem(PERSIST_KEY);
        localStorage.removeItem(LOGS_KEY);
      }
    } catch {
      /* best-effort */
    }
    set({ persist: v });
  },
  toggleFilter: (level) => set((s) => ({ filter: { ...s.filter, [level]: !s.filter[level] } })),
}));

/** Imperative helper so non-React runtime code can log without hooks. */
export const gameConsole = {
  log: (source: string, ...args: unknown[]) => useConsoleStore.getState().push('log', source, args),
  info: (source: string, ...args: unknown[]) => useConsoleStore.getState().push('info', source, args),
  warn: (source: string, ...args: unknown[]) => useConsoleStore.getState().push('warn', source, args),
  error: (source: string, ...args: unknown[]) => useConsoleStore.getState().push('error', source, args),
  debug: (source: string, ...args: unknown[]) => useConsoleStore.getState().push('debug', source, args),
};
