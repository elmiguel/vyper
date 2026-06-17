import type { Asset, Entity, Vec3 } from '@/types';

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

// Uploaded assets (3D models / textures stored by the backend). Kept OUT of the
// `api` object so they aren't part of the swappable DataApi contract — runtime
// upload is a web/server feature, not part of the desktop IPC data service.
export const listUploadedAssets = () => req<{ assets: Asset[] }>('/assets');

/** Delete an uploaded asset (removes its manifest entry + orphaned files). */
export const deleteUploadedAsset = (id: string) => req<void>(`/assets/${encodeURIComponent(id)}`, { method: 'DELETE' });

export async function uploadAssets(files: File[]): Promise<{ assets: Asset[] }> {
  const form = new FormData();
  for (const f of files) form.append('files', f);
  // Multipart — let the browser set the boundary Content-Type (don't use req()).
  const res = await fetch('/api/assets', { method: 'POST', body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<{ assets: Asset[] }>;
}

// ---- CC0 asset library (Poly Haven / ambientCG), proxied + imported by the server ----

export type Cc0Provider = 'polyhaven' | 'ambientcg';
export type Cc0Type = 'material' | 'hdri';
export type Cc0MapField = 'baseColorMap' | 'normalMap' | 'roughnessMap' | 'aoMap';

export interface Cc0Item {
  provider: Cc0Provider;
  id: string;
  name: string;
  type: Cc0Type;
  thumbUrl: string;
  categories: string[];
}

/** Result of importing a CC0 asset: new texture assets, an optional ready-to-apply
 *  material map (texture URLs by field), and an optional HDRI environment URL. */
export interface Cc0ImportResult {
  assets: Asset[];
  material?: Partial<Record<Cc0MapField, string>>;
  environmentUrl?: string;
}

export const browseCc0 = (provider: Cc0Provider, type: Cc0Type) =>
  req<{ items: Cc0Item[] }>(`/assets/cc0/catalog?provider=${provider}&type=${type}`);

export const importCc0 = (body: { provider: Cc0Provider; id: string; type?: Cc0Type; res?: string }) =>
  req<Cc0ImportResult>('/assets/cc0/import', { method: 'POST', body: JSON.stringify(body) });
