import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Asset } from '@/types';

// In-memory app-state singleton standing in for the backend.
let app: { lastGameId: string | null; data: Record<string, unknown> };
const getApp = vi.fn(async () => app);
const putApp = vi.fn(async (body: { lastGameId?: string | null; data?: Record<string, unknown> }) => {
  app = { lastGameId: body.lastGameId ?? null, data: body.data ?? {} };
  return app;
});

vi.mock('@/data', () => ({ api: { getApp: () => getApp(), putApp: (b: never) => putApp(b) } }));

import { loadGlobalLibrary, publishGlobalLibrary, unpublishGlobalLibrary, setLastGame } from './globalLibrary';

const asset = (id: string, pos: number[]): Asset => ({
  id, name: id, type: 'model', source: 'generated', format: 'mesh', textures: [],
  geometry: { positions: pos, indices: [], normals: [] }, reference: true,
});

beforeEach(() => {
  app = { lastGameId: 'g1', data: { other: 'keep' } };
  getApp.mockClear();
  putApp.mockClear();
});

describe('globalLibrary (shared cross-project reference assets)', () => {
  it('publishes assets without clobbering lastGameId or other data keys', async () => {
    await publishGlobalLibrary([asset('a', [1, 2, 3])]);
    expect(app.lastGameId).toBe('g1');
    expect(app.data.other).toBe('keep');
    expect((app.data.library as Asset[]).map((a) => a.id)).toEqual(['a']);
  });

  it('loadGlobalLibrary returns the persisted library', async () => {
    await publishGlobalLibrary([asset('a', [1, 2, 3])]);
    const lib = await loadGlobalLibrary();
    expect(lib.map((a) => a.id)).toEqual(['a']);
  });

  it('re-publishing the same id upserts (replaces, no duplicate)', async () => {
    await publishGlobalLibrary([asset('a', [1, 2, 3])]);
    await publishGlobalLibrary([asset('a', [9, 9, 9])]);
    const lib = await loadGlobalLibrary();
    expect(lib).toHaveLength(1);
    expect(lib[0].geometry!.positions).toEqual([9, 9, 9]);
  });

  it('publishing an empty list is a no-op (no write)', async () => {
    await publishGlobalLibrary([]);
    expect(putApp).not.toHaveBeenCalled();
  });

  it('unpublish removes the asset but keeps lastGameId + other data', async () => {
    await publishGlobalLibrary([asset('a', [1, 2, 3]), asset('b', [4, 5, 6])]);
    await unpublishGlobalLibrary('a');
    const lib = await loadGlobalLibrary();
    expect(lib.map((a) => a.id)).toEqual(['b']);
    expect(app.lastGameId).toBe('g1');
    expect(app.data.other).toBe('keep');
  });

  it('setLastGame updates lastGameId without wiping the library', async () => {
    await publishGlobalLibrary([asset('a', [1, 2, 3])]);
    await setLastGame('g2');
    expect(app.lastGameId).toBe('g2');
    expect((app.data.library as Asset[]).map((a) => a.id)).toEqual(['a']);
  });

  it('survives a backend error on read (returns empty, no throw)', async () => {
    getApp.mockRejectedValueOnce(new Error('offline'));
    expect(await loadGlobalLibrary()).toEqual([]);
  });
});
