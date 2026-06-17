import type { DockviewApi } from 'dockview';
import type { PlayState } from '@/types';
import { useEditorStore } from '@/store/editorStore';
import { BUILTIN_PRESETS, DEFAULT_PRESET_ID, applyPreset } from './workspacePresets';

const SCENE = 'scene';
const GAME = 'preview';

/**
 * Holds the live dockview api so the Toolbar's Layout menu can drive the dock
 * (apply presets, save/reset) without prop-drilling through EditorLayout.
 */
let api: DockviewApi | null = null;

/** True while play/pause has split the Game out of the Scene's tab group. */
let didSplit = false;

export function setDockApi(a: DockviewApi | null) {
  api = a;
  if (!a) didSplit = false;
}

/** Bring a panel's tab to the front of its group. */
function focus(id: string) {
  api?.getPanel(id)?.api.setActive();
}

/** If Scene and Game share a tab group, split Game out to the right so both show. */
function splitIfTabbed() {
  const scene = api?.getPanel(SCENE);
  const game = api?.getPanel(GAME);
  if (scene && game && scene.api.group === game.api.group) {
    game.api.moveTo({ group: scene.api.group, position: 'right' });
    didSplit = true;
  }
}

/** Undo a play/pause split by re-tabbing Game back into the Scene's group. */
function remerge() {
  const scene = api?.getPanel(SCENE);
  const game = api?.getPanel(GAME);
  if (scene && game && scene.api.group !== game.api.group) {
    game.api.moveTo({ group: scene.api.group, position: 'center' });
  }
  didSplit = false;
}

/**
 * Drive the Scene/Game dock tabs from the play transport:
 * - Play      → focus the Game view.
 * - Pause     → split Scene + Game side by side (both visible).
 * - Resume    → re-merge and go back to the Game view.
 * - Stop      → re-merge and focus the Scene editor.
 * Moves relocate panels without remounting, so the Babylon views are preserved.
 */
export function reactToPlayState(prev: PlayState, next: PlayState) {
  if (!api || prev === next) return;
  if (next === 'playing') {
    if (prev === 'paused' && didSplit) remerge();
    focus(GAME);
  } else if (next === 'paused') {
    splitIfTabbed();
    focus(SCENE);
    focus(GAME);
  } else if (next === 'editing') {
    if (didSplit) remerge();
    focus(SCENE);
  }
}

/** Apply a preset by id — a built-in (rebuilt from its builder) or a saved custom layout. */
export function activatePreset(id: string) {
  if (!api) return;
  const builtin = BUILTIN_PRESETS[id];
  if (builtin) {
    applyPreset(api, builtin);
  } else {
    const custom = useEditorStore.getState().workspace.custom.find((c) => c.id === id);
    if (!custom) return;
    api.fromJSON(custom.layout);
  }
  useEditorStore.getState().setActivePreset(id);
}

/** Restore the Default arrangement. */
export function resetWorkspace() {
  activatePreset(DEFAULT_PRESET_ID);
}

/** Save the current arrangement as a named custom layout and make it active. */
export function saveCurrentLayout(label: string) {
  if (!api) return;
  useEditorStore.getState().saveCustomLayout(label, api.toJSON());
}
