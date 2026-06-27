import { create } from 'zustand';
import { emptyAssetLibrary, emptyDesign, defaultBrush } from '@/types';
import type { EditorState } from './editorTypes';
import { hmrSingleton } from './hmrStore';
import { DEFAULT_GAME_CAMERA, defaultEntities } from './editorDefaults';
import { createUiSlice } from './slices/uiSlice';
import { createHistorySlice } from './slices/historySlice';
import { createEntitySlice } from './slices/entitySlice';
import { createEffectSlice } from './slices/effectSlice';
import { createScriptSlice } from './slices/scriptSlice';
import { createDesignSlice } from './slices/designSlice';
import { createAssetSlice } from './slices/assetSlice';
import { createPrefabSlice } from './slices/prefabSlice';
import { createMaterialSlice } from './slices/materialSlice';
import { createPersistenceSlice } from './slices/persistenceSlice';
import { createWorkspaceSlice, defaultWorkspace } from './slices/workspaceSlice';
import { createMeshEditSlice } from './slices/meshEditSlice';
import { createRigSlice } from './slices/rigSlice';
import { createEditorPrefsSlice } from './slices/editorPrefsSlice';
import { loadEditorPrefs } from './editorPrefs';

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
export const useEditorStore = hmrSingleton('editor', () => create<EditorState>((set, get) => ({
  mode: '3d',
  entities: defaultEntities(),
  scripts: {},
  selectedId: null,
  activeScriptId: null,
  lastScriptByEntity: {},
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
  editorEffects: true,
  assetLibrary: emptyAssetLibrary(),
  selectedAssetId: null,
  assetClipboard: null,
  showAssetBrowser: false,
  showAssetViewer: false,
  focusRequest: 0,
  gizmoMode: 'move',
  sculpting: false,
  mayaNav: false,
  brush: defaultBrush(),
  meshEdit: { active: false, entityId: null, component: 'face', selection: [], sculpt: null, tool: 'select' },
  rig: { active: false, entityId: null, selectedBone: null, activeClipId: null, playhead: 0, playing: false, scrubPose: null },
  keymap: 'maya',
  gameCamera: structuredClone(DEFAULT_GAME_CAMERA),
  cameraRevision: 0,
  gridVisible: true,
  editorPrefs: loadEditorPrefs(),
  showSurfaces: true,
  snapToGrid: false,
  clipboard: null,
  prefabs: {},
  materialPresets: {},
  past: [],
  future: [],
  workspace: defaultWorkspace(),

  ...createUiSlice(set),
  ...createHistorySlice(set, get),
  ...createEntitySlice(set, get),
  ...createEffectSlice(set, get),
  ...createScriptSlice(set, get),
  ...createDesignSlice(set),
  ...createAssetSlice(set, get),
  ...createPrefabSlice(set, get),
  ...createMaterialSlice(set, get),
  ...createPersistenceSlice(set),
  ...createWorkspaceSlice(set),
  ...createMeshEditSlice(set, get),
  ...createRigSlice(set, get),
  ...createEditorPrefsSlice(set),
})));
