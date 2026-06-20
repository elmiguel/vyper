import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

// Controllable fake editor store. getState() returns this object; tests mutate
// `state.playState` / `state.keymap` and assert which actions were dispatched.
const state = {
  playState: 'editing' as 'editing' | 'playing' | 'paused',
  keymap: 'blender' as const, // Blender binds playToggle to Space — the bug case
  selectedId: null as string | null,
  showShortcuts: false,
  mode: '3d' as '2d' | '3d',
  entities: [] as Array<{ id: string; mesh?: unknown }>,
  meshEdit: { active: false, component: 'face' as 'vertex' | 'edge' | 'face' },
  play: vi.fn(),
  pause: vi.fn(),
  stop: vi.fn(),
  setShowShortcuts: vi.fn(),
  setMeshComponent: vi.fn(),
  beginMeshEdit: vi.fn(),
  endMeshEdit: vi.fn(),
  removeEntity: vi.fn(),
};

// Fake Edit-Mode controller exposed via getManager(); hoisted so the vi.mock factory can see it.
const { mec } = vi.hoisted(() => ({
  mec: {
    applyOp: vi.fn(), growSelection: vi.fn(), shrinkSelection: vi.fn(), selectLoop: vi.fn(),
    copyComponents: vi.fn(), pasteComponents: vi.fn(), duplicateComponents: vi.fn(),
  },
}));

vi.mock('@/store/editorStore', () => ({
  useEditorStore: { getState: () => state },
}));
vi.mock('@/nodes/nodeActions', () => ({ nodeEditorBridge: { engaged: false, ops: null } }));
vi.mock('@/babylon/engine', () => ({ getManager: () => ({ meshEditController: mec }) }));

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

describe('useShortcuts — mesh component-mode keys (1/2/3/4)', () => {
  beforeEach(() => {
    state.playState = 'editing';
    state.mode = '3d';
    state.selectedId = null;
    state.entities = [];
    state.meshEdit = { active: false, component: 'face' };
    vi.clearAllMocks();
  });

  it('switches component in Edit Mode (2 = vertex, 3 = edge, 4 = face)', () => {
    state.meshEdit = { active: true, component: 'face' };
    renderHook(() => useShortcuts());
    press('2');
    expect(state.setMeshComponent).toHaveBeenCalledWith('vertex');
    press('3');
    expect(state.setMeshComponent).toHaveBeenCalledWith('edge');
    press('4');
    expect(state.setMeshComponent).toHaveBeenCalledWith('face');
  });

  it('leaves Edit Mode on 1 (object) when editing', () => {
    state.meshEdit = { active: true, component: 'vertex' };
    renderHook(() => useShortcuts());
    press('1');
    expect(state.endMeshEdit).toHaveBeenCalledTimes(1);
    expect(state.setMeshComponent).not.toHaveBeenCalled();
  });

  it('enters Edit Mode on 2/3/4 when a mesh entity is selected', () => {
    state.selectedId = 'cube';
    state.entities = [{ id: 'cube', mesh: {} }];
    renderHook(() => useShortcuts());
    press('3');
    expect(state.beginMeshEdit).toHaveBeenCalledWith('cube');
    expect(state.setMeshComponent).toHaveBeenCalledWith('edge');
  });

  it('does nothing on a component key when nothing editable is selected', () => {
    renderHook(() => useShortcuts());
    press('2');
    expect(state.beginMeshEdit).not.toHaveBeenCalled();
    expect(state.setMeshComponent).not.toHaveBeenCalled();
  });
});

describe('useShortcuts — Edit-Mode component keys', () => {
  beforeEach(() => {
    state.playState = 'editing';
    state.mode = '3d';
    state.selectedId = 'cube';
    state.meshEdit = { active: true, component: 'face' };
    vi.clearAllMocks();
  });

  it('Delete removes the selected components, not the whole entity', () => {
    renderHook(() => useShortcuts());
    press('Delete');
    expect(mec.applyOp).toHaveBeenCalledWith('delete');
    expect(state.removeEntity).not.toHaveBeenCalled();
  });

  it('Backspace also deletes components', () => {
    renderHook(() => useShortcuts());
    press('Backspace');
    expect(mec.applyOp).toHaveBeenCalledWith('delete');
  });

  it('Ctrl+E extrudes the selection', () => {
    renderHook(() => useShortcuts());
    press('e', { ctrlKey: true });
    expect(mec.applyOp).toHaveBeenCalledWith('extrude', 0.5);
  });

  it('> grows and < shrinks the selection', () => {
    renderHook(() => useShortcuts());
    press('>');
    expect(mec.growSelection).toHaveBeenCalledTimes(1);
    press('<');
    expect(mec.shrinkSelection).toHaveBeenCalledTimes(1);
  });

  it('L runs a loop select', () => {
    renderHook(() => useShortcuts());
    press('l');
    expect(mec.selectLoop).toHaveBeenCalledTimes(1);
  });

  it('does not fire Edit-Mode keys when not in Edit Mode', () => {
    state.meshEdit = { active: false, component: 'face' };
    renderHook(() => useShortcuts());
    press('>');
    press('l');
    expect(mec.growSelection).not.toHaveBeenCalled();
    expect(mec.selectLoop).not.toHaveBeenCalled();
  });

  it('copy/paste/duplicate route to components in Edit Mode (Blender: mod+c/v, shift+d)', () => {
    renderHook(() => useShortcuts());
    press('c', { ctrlKey: true });
    expect(mec.copyComponents).toHaveBeenCalledTimes(1);
    press('v', { ctrlKey: true });
    expect(mec.pasteComponents).toHaveBeenCalledTimes(1);
    press('d', { shiftKey: true });
    expect(mec.duplicateComponents).toHaveBeenCalledTimes(1);
  });
});
