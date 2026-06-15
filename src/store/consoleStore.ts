import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type { LogEntry, LogLevel } from '@/types';

interface ConsoleState {
  logs: LogEntry[];
  /** When true, log() collapses consecutive identical messages into a count. */
  collapse: boolean;
  filter: Record<LogLevel, boolean>;
  push: (level: LogLevel, source: string, args: unknown[]) => void;
  clear: () => void;
  setCollapse: (v: boolean) => void;
  toggleFilter: (level: LogLevel) => void;
}

const MAX_LOGS = 500;

function format(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
  try {
    return JSON.stringify(arg, (_k, v) => (typeof v === 'function' ? '[fn]' : v));
  } catch {
    return String(arg);
  }
}

export const useConsoleStore = create<ConsoleState>((set, get) => ({
  logs: [],
  collapse: true,
  filter: { log: true, info: true, warn: true, error: true, debug: true },
  push: (level, source, args) => {
    const message = args.map(format).join(' ');
    set((state) => {
      const last = state.logs[state.logs.length - 1];
      if (state.collapse && last && last.level === level && last.message === message && last.source === source) {
        const logs = state.logs.slice();
        logs[logs.length - 1] = { ...last, count: last.count + 1, time: Date.now() };
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
      return { logs };
    });
  },
  clear: () => set({ logs: [] }),
  setCollapse: (v) => set({ collapse: v }),
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
