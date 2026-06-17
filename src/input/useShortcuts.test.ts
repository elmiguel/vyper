import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

// Controllable fake editor store. getState() returns this object; tests mutate
// `state.playState` / `state.keymap` and assert which actions were dispatched.
const state = {
  playState: 'editing' as 'editing' | 'playing' | 'paused',
  keymap: 'blender' as const, // Blender binds playToggle to Space — the bug case
  selectedId: null as string | null,
  showShortcuts: false,
  play: vi.fn(),
  pause: vi.fn(),
  stop: vi.fn(),
  setShowShortcuts: vi.fn(),
};

vi.mock('@/store/editorStore', () => ({
  useEditorStore: { getState: () => state },
}));
vi.mock('@/nodes/nodeActions', () => ({ nodeEditorBridge: { engaged: false, ops: null } }));

import { useShortcuts } from './useShortcuts';

const press = (key: string, init: KeyboardEventInit = {}) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }));

describe('useShortcuts — game owns the keyboard while playing', () => {
  beforeEach(() => {
    state.playState = 'editing';
    state.keymap = 'blender';
    state.showShortcuts = false;
    vi.clearAllMocks();
  });

  it('Space toggles play from the editor (Blender binds playToggle to Space)', () => {
    renderHook(() => useShortcuts());
    press(' ');
    expect(state.play).toHaveBeenCalledTimes(1);
  });

  it('does NOT pause the game when Space is pressed while playing (lets the player jump)', () => {
    state.playState = 'playing';
    renderHook(() => useShortcuts());
    press(' ');
    expect(state.pause).not.toHaveBeenCalled();
    expect(state.play).not.toHaveBeenCalled();
  });

  it('still honors the stop shortcut while playing (Esc exits play)', () => {
    state.playState = 'playing';
    renderHook(() => useShortcuts());
    press('Escape');
    expect(state.stop).toHaveBeenCalledTimes(1);
  });

  it('lets playToggle resume from a paused state', () => {
    state.playState = 'paused';
    renderHook(() => useShortcuts());
    press(' ');
    // 'paused' is not 'editing', so playToggle calls pause()/resume path, not play()
    expect(state.pause).toHaveBeenCalledTimes(1);
  });
});
