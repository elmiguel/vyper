import type { Entity, Vec3 } from '@/types';

/** Typed client for the Vyper backend (proxied at /api in dev). */

export interface GameSummary {
  id: string;
  owner: string;
  name: string;
  description: string;
  activeSceneId: string | null;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  sceneCount?: number;
}

export interface SceneMeta {
  id: string;
  gameId: string;
  name: string;
  orderIndex: number;
  gridVisible: boolean;
  updatedAt: string;
}

export interface SceneFull extends SceneMeta {
  entities: Entity[];
  gameCamera: { position: Vec3; rotation: Vec3 };
}

export interface ScriptRow {
  id: string;
  gameId: string;
  name: string;
  mode: 'nodes' | 'code';
  code: string;
  codeDirty: boolean;
  enabled: boolean;
  graph: { nodes?: unknown[]; edges?: unknown[] };
}

export interface GameDetail {
  game: GameSummary;
  scenes: SceneMeta[];
  scripts: ScriptRow[];
}

export interface VersionMeta {
  id: string;
  label: string;
  kind: 'auto' | 'manual';
  createdAt: string;
}

export interface VersionFull extends VersionMeta {
  sceneId: string;
  gameId: string;
  entities: Entity[];
  gameCamera: { position: Vec3; rotation: Vec3 };
  gridVisible: boolean;
  scripts: ScriptRow[];
}

export interface VersionInput {
  kind: 'auto' | 'manual';
  label?: string;
  entities: Entity[];
  gameCamera: unknown;
  gridVisible: boolean;
  scripts: unknown[];
}

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `${res.status} ${res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  // app state
  getApp: () => req<{ lastGameId: string | null; data: Record<string, unknown> }>('/app'),
  putApp: (body: { lastGameId?: string | null; data?: Record<string, unknown> }) =>
    req('/app', { method: 'PUT', body: JSON.stringify(body) }),

  // games
  listGames: () => req<GameSummary[]>('/games'),
  getGame: (id: string) => req<GameDetail>(`/games/${id}`),
  createGame: (name: string, description = '') =>
    req<GameDetail>('/games', { method: 'POST', body: JSON.stringify({ name, description }) }),
  patchGame: (id: string, patch: Partial<Pick<GameSummary, 'name' | 'description' | 'activeSceneId' | 'settings'>>) =>
    req<GameSummary>(`/games/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteGame: (id: string) => req<void>(`/games/${id}`, { method: 'DELETE' }),
  putScripts: (gameId: string, scripts: unknown[]) =>
    req<{ ok: boolean; count: number }>(`/games/${gameId}/scripts`, {
      method: 'PUT',
      body: JSON.stringify({ scripts }),
    }),

  // scenes
  getScene: (id: string) => req<SceneFull>(`/scenes/${id}`),
  createScene: (gameId: string, name?: string) =>
    req<SceneMeta>(`/games/${gameId}/scenes`, { method: 'POST', body: JSON.stringify({ name }) }),
  patchScene: (
    id: string,
    patch: Partial<{ name: string; entities: Entity[]; gameCamera: unknown; gridVisible: boolean; orderIndex: number }>,
  ) => req<SceneFull>(`/scenes/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteScene: (id: string) => req<void>(`/scenes/${id}`, { method: 'DELETE' }),

  // version history (revert)
  listVersions: (sceneId: string) => req<VersionMeta[]>(`/scenes/${sceneId}/versions`),
  getVersion: (id: string) => req<VersionFull>(`/versions/${id}`),
  createVersion: (sceneId: string, body: VersionInput) =>
    req<VersionMeta>(`/scenes/${sceneId}/versions`, { method: 'POST', body: JSON.stringify(body) }),
};
