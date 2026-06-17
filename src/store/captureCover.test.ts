import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the engine so the test doesn't pull in the Babylon/WebGL graph; the
// captureThumbnail result is driven per-case via `mock.thumb`.
const mock = vi.hoisted(() => ({ thumb: null as string | null }));
vi.mock('@/babylon/engine', () => ({
  getManager: () => ({ captureThumbnail: () => mock.thumb }),
  getRuntime: () => null,
  acquireEngine: vi.fn(),
}));

import { useProjectStore } from './projectStore';
import { api } from '@/data';

describe('captureCover', () => {
  beforeEach(() => {
    useProjectStore.setState({ gameId: 'g1', gameSettings: { kind: '3d' }, error: null });
    mock.thumb = null;
  });

  it('persists a captured thumbnail as the open project cover', async () => {
    mock.thumb = 'data:image/jpeg;base64,shot';
    const spy = vi.spyOn(api, 'patchGame').mockResolvedValue({} as never);

    const ok = await useProjectStore.getState().captureCover();

    expect(ok).toBe(true);
    expect(useProjectStore.getState().gameSettings.coverImage).toBe('data:image/jpeg;base64,shot');
    expect(spy).toHaveBeenCalledWith('g1', {
      settings: expect.objectContaining({ coverImage: 'data:image/jpeg;base64,shot' }),
    });
    spy.mockRestore();
  });

  it('fails without persisting when the viewport cannot be captured', async () => {
    mock.thumb = null;
    const spy = vi.spyOn(api, 'patchGame').mockResolvedValue({} as never);

    const ok = await useProjectStore.getState().captureCover();

    expect(ok).toBe(false);
    expect(useProjectStore.getState().gameSettings.coverImage).toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('does nothing when no project is open', async () => {
    useProjectStore.setState({ gameId: null });
    mock.thumb = 'data:image/jpeg;base64,shot';
    const spy = vi.spyOn(api, 'patchGame').mockResolvedValue({} as never);

    expect(await useProjectStore.getState().captureCover()).toBe(false);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
