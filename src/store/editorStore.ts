import { create } from 'zustand';
import { emptyDesign } from '@/types';
import type { EditorState } from './editorTypes';
import { DEFAULT_GAME_CAMERA, defaultEntities } from './editorDefaults';
import { createUiSlice } from './slices/uiSlice';
import { createHistorySlice } from './slices/historySlice';
import { createEntitySlice } from './slices/entitySlice';
import { createEffectSlice } from './slices/effectSlice';
import { createScriptSlice } from './slices/scriptSlice';
import { createDesignSlice } from './slices/designSlice';
import { createPersistenceSlice } from './slices/persistenceSlice';

// Re-exported for consumers (e.g. projectStore seeding a fresh scene) and to keep
// the camera defaults importable from this module as before.
export { starterEntities, DEFAULT_GAME_CAMERA, DEFAULT_GAME_CAMERA_2D, defaultGameCamera } from './editorDefaults';
export type { EditorState } from './editorTypes';

/**
 * The editor's single source of truth. State and actions are composed from
 * domain slices (selection/view, history, entities, effects, scripts, design,
 * persistence) — see ./slices. Each slice receives the same zustand set/get and
 * operates on the full EditorState, so cross-slice calls (e.g. record() before an
 * edit) work exactly as in a monolithic store.
 */
export const useEditorStore = create<EditorState>((set, get) => ({
  mode: '3d',
  entities: defaultEntities(),
  scripts: {},
  selectedId: null,
  activeScriptId: null,
  activeEffect: null,
  playState: 'editing',
  sceneRevision: 0,
  showInspector3D: false,
  showShortcuts: false,
  design: emptyDesign(),
  showDesign: false,
  showHud: false,
  selectedHudId: null,
  runTour: false,
  focusRequest: 0,
  gizmoMode: 'move',
  keymap: 'maya',
  gameCamera: structuredClone(DEFAULT_GAME_CAMERA),
  cameraRevision: 0,
  gridVisible: true,
  clipboard: null,
  past: [],
  future: [],

  ...createUiSlice(set),
  ...createHistorySlice(set, get),
  ...createEntitySlice(set, get),
  ...createEffectSlice(set, get),
  ...createScriptSlice(set, get),
  ...createDesignSlice(set),
  ...createPersistenceSlice(set),
}));
