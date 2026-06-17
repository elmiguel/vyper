import { isDesktop } from '@/buildEnv';
import { api as httpApi } from '@/api/client';
import { desktopApi } from './desktopApi';
import type { DataApi } from './types';

/**
 * The active data provider, chosen once at startup by build target:
 *   - desktop (Electron) → embedded PGlite over IPC
 *   - web                → HTTP `/api`
 * Consumers (e.g. projectStore) import `api` from here and never need to care which.
 */
export const api: DataApi = isDesktop() ? desktopApi : httpApi;

export type { DataApi } from './types';
// Re-export the shared DTO types so callers have one import site.
export type {
  GameSummary,
  SceneMeta,
  SceneFull,
  ScriptRow,
  GameDetail,
  VersionMeta,
  VersionFull,
  VersionInput,
} from '@/api/client';
