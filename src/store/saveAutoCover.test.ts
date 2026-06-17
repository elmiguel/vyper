import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Drive captureThumbnail without loading the Babylon/WebGL graph, and count calls
// so we can assert the auto-cover is grabbed at most once.
const mock = vi.hoisted(() => ({ thumb: 'data:image/jpeg;base64,shot', calls: 0 }));
vi.mock('@/babylon/engine', () => ({
  getManager: () => ({ captureThumbnail: () => { mock.calls++; return mock.thumb; } }),
  getRuntime: () => null,
  acquireEngine: vi.fn(),
}));

import { useProjectStore } from './projectStore';
import { api } from '@/data';

describe('save auto-cover', () => {
  beforeEach(() => {
    mock.calls = 0;
    mock.thumb = 'data:image/jpeg;base64,shot';
    vi.spyOn(api, 'patchScene').mockResolvedValue({} as never);
    vi.spyOn(api, 'putScripts').mockResolvedValue({} as never);
    vi.spyOn(api, 'patchGame').mockResolvedValue({} as never);
    vi.spyOn(api, 'createVersion').mockResolvedValue({} as never);
    useProjectStore.setState({ sceneId: 's1', error: null, lastSnapshotAt: null });
  });
  afterEach(() => vi.restoreAllMocks());

  it('captures a cover on the first autosave and never re-captures', async () => {
    useProjectStore.setState({ gameId: 'g1', gameSettings: { kind: '3d' } });
    await useProjectStore.getState().save({ snapshot: 'auto' });
    expect(useProjectStore.getState().gameSettings.coverImage).toBe('data:image/jpeg;base64,shot');
    expect(mock.calls).toBe(1);

    await useProjectStore.getState().save({ snapshot: 'auto' });
    expect(mock.calls).toBe(1); // guard + existing cover prevent a second capture
  });

  it('does not auto-capture on a manual save', async () => {
    useProjectStore.setState({ gameId: 'g2', gameSettings: { kind: '3d' } });
    await useProjectStore.getState().save({ snapshot: 'manual' });
    expect(mock.calls).toBe(0);
    expect(useProjectStore.getState().gameSettings.coverImage).toBeUndefined();
  });

  it('never overwrites an existing (e.g. user-uploaded) cover', async () => {
    useProjectStore.setState({ gameId: 'g3', gameSettings: { kind: '3d', coverImage: 'data:existing' } });
    await useProjectStore.getState().save({ snapshot: 'auto' });
    expect(mock.calls).toBe(0);
    expect(useProjectStore.getState().gameSettings.coverImage).toBe('data:existing');
  });
});
