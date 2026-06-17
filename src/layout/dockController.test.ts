import { describe, it, expect, beforeEach } from 'vitest';
import type { DockviewApi } from 'dockview';
import { setDockApi, reactToPlayState } from './dockController';

/**
 * Minimal dock model: panels belong to groups, can be re-grouped via moveTo, and
 * track which tab is active per group. Enough to assert the Scene/Game behavior.
 */
function mockDock(sceneGroup: string, gameGroup: string) {
  const group = { scene: sceneGroup, game: gameGroup };
  const active: Record<string, string> = {};
  let nextGroupId = 0;
  // Stable group object per id, so same-group panels compare equal by reference
  // (mirrors dockview returning one DockviewGroupPanel per group).
  const objs: Record<string, { id: string }> = {};
  const groupObj = (id: string) => (objs[id] ??= { id });

  const panel = (key: 'scene' | 'game') => ({
    api: {
      get group() {
        return groupObj(group[key]);
      },
      setActive() {
        active[group[key]] = key;
      },
      moveTo({ group: target, position }: { group: { id: string }; position: string }) {
        // 'center' tabs into the target group; anything else makes a fresh group.
        group[key] = position === 'center' ? target.id : `g${++nextGroupId}`;
      },
    },
  });

  const api = {
    getPanel: (id: string) => (id === 'scene' ? panel('scene') : id === 'preview' ? panel('game') : undefined),
  } as unknown as DockviewApi;

  return { api, group, active };
}

describe('reactToPlayState (Scene/Game dock tabs)', () => {
  beforeEach(() => setDockApi(null));

  it('focuses the Game view on Play', () => {
    const dock = mockDock('A', 'A'); // tabbed together
    setDockApi(dock.api);
    reactToPlayState('editing', 'playing');
    expect(dock.active['A']).toBe('game');
  });

  it('splits Scene and Game into separate groups on Pause when tabbed', () => {
    const dock = mockDock('A', 'A');
    setDockApi(dock.api);
    reactToPlayState('editing', 'playing');
    reactToPlayState('playing', 'paused');
    expect(dock.group.scene).not.toBe(dock.group.game); // now side by side
  });

  it('does not split when Scene and Game are already in different groups', () => {
    const dock = mockDock('A', 'B');
    setDockApi(dock.api);
    reactToPlayState('editing', 'playing');
    reactToPlayState('playing', 'paused');
    expect(dock.group.scene).toBe('A');
    expect(dock.group.game).toBe('B');
  });

  it('re-merges Game back into Scene and focuses Game on Resume', () => {
    const dock = mockDock('A', 'A');
    setDockApi(dock.api);
    reactToPlayState('editing', 'playing');
    reactToPlayState('playing', 'paused');
    reactToPlayState('paused', 'playing');
    expect(dock.group.game).toBe(dock.group.scene); // re-tabbed
    expect(dock.active[dock.group.scene]).toBe('game');
  });

  it('re-merges and focuses the Scene editor on Stop', () => {
    const dock = mockDock('A', 'A');
    setDockApi(dock.api);
    reactToPlayState('editing', 'playing');
    reactToPlayState('playing', 'paused');
    reactToPlayState('paused', 'editing');
    expect(dock.group.game).toBe(dock.group.scene);
    expect(dock.active[dock.group.scene]).toBe('scene');
  });

  it('is a no-op when the play state does not change', () => {
    const dock = mockDock('A', 'A');
    setDockApi(dock.api);
    reactToPlayState('editing', 'editing');
    expect(dock.active).toEqual({});
  });
});
