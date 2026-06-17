import type { EditorState, StoreSet } from '../editorTypes';
import { defaultGameCamera } from '../editorDefaults';
import { defaultBrush } from '@/types';

type UiSlice = Pick<
  EditorState,
  | 'select'
  | 'setActiveScript'
  | 'setActiveEffect'
  | 'setMode'
  | 'setGizmoMode'
  | 'setKeymap'
  | 'focusSelected'
  | 'updateGameCamera'
  | 'resetGameCamera'
  | 'toggleGrid'
  | 'toggleEditorEffects'
  | 'toggleSurfaces'
  | 'toggleSnapToGrid'
  | 'play'
  | 'pause'
  | 'stop'
  | 'toggleInspector3D'
  | 'setShowShortcuts'
  | 'setShowDesign'
  | 'setRunTour'
  | 'setSculpting'
  | 'setMayaNav'
  | 'setBrush'
>;

/** Selection, editor mode/shortcuts, view objects (camera/grid), and play control. */
export function createUiSlice(set: StoreSet): UiSlice {
  return {
    select: (id) => set({ selectedId: id }),
    setActiveScript: (id) => set({ activeScriptId: id }),
    setActiveEffect: (sel) => set({ activeEffect: sel }),

    setMode: (mode) => set({ mode }),
    setGizmoMode: (mode) => set({ gizmoMode: mode }),
    setKeymap: (id) => set({ keymap: id }),
    focusSelected: () => set((s) => ({ focusRequest: s.focusRequest + 1 })),

    // Camera/grid are view state, not part of the undo snapshot — don't record().
    updateGameCamera: (patch) =>
      set((s) => ({ gameCamera: { ...s.gameCamera, ...patch }, cameraRevision: s.cameraRevision + 1 })),
    resetGameCamera: () =>
      set((s) => ({ gameCamera: defaultGameCamera(s.mode), cameraRevision: s.cameraRevision + 1 })),
    toggleGrid: () => set((s) => ({ gridVisible: !s.gridVisible })),
    toggleEditorEffects: () => set((s) => ({ editorEffects: !s.editorEffects })),
    toggleSurfaces: () => set((s) => ({ showSurfaces: !s.showSurfaces })),
    toggleSnapToGrid: () => set((s) => ({ snapToGrid: !s.snapToGrid })),

    play: () => set({ playState: 'playing' }),
    pause: () => set((s) => ({ playState: s.playState === 'paused' ? 'playing' : 'paused' })),
    stop: () => set({ playState: 'editing' }),
    toggleInspector3D: () => set((s) => ({ showInspector3D: !s.showInspector3D })),
    setShowShortcuts: (v) => set({ showShortcuts: v }),
    setShowDesign: (v) => set({ showDesign: v }),
    setRunTour: (v) => set({ runTour: v }),

    // Terrain sculpt tool (view state, not undo-recorded; commits go through updateTerrain).
    setSculpting: (v) => set({ sculpting: v }),
    setMayaNav: (v) => set({ mayaNav: v }),
    setBrush: (patch) => set((s) => ({ brush: { ...(s.brush ?? defaultBrush()), ...patch } })),
  };
}
