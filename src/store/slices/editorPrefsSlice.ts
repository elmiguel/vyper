import type { EditorState, StoreSet } from '../editorTypes';
import { defaultEditorPrefs, saveEditorPrefs, type EditorPrefs } from '../editorPrefs';

type EditorPrefsSlice = Pick<
  EditorState,
  'updateSelectionPrefs' | 'updateGridPrefs' | 'resetEditorPrefs' | 'hydrateEditorPrefs'
>;

/**
 * Per-user editor preferences (localStorage-backed). Each action writes the next
 * prefs object to storage and returns a fresh reference, so the engine's identity
 * comparison re-applies it to the live scene (see engine.ts).
 */
export function createEditorPrefsSlice(set: StoreSet): EditorPrefsSlice {
  return {
    updateSelectionPrefs: (patch) =>
      set((s) => {
        const next: EditorPrefs = {
          ...s.editorPrefs,
          selection: { ...s.editorPrefs.selection, ...patch },
        };
        saveEditorPrefs(next);
        return { editorPrefs: next };
      }),

    updateGridPrefs: (patch) =>
      set((s) => {
        const next: EditorPrefs = {
          ...s.editorPrefs,
          grid: { ...s.editorPrefs.grid, ...patch },
        };
        saveEditorPrefs(next);
        return { editorPrefs: next };
      }),

    resetEditorPrefs: () => {
      const next = defaultEditorPrefs();
      saveEditorPrefs(next);
      set({ editorPrefs: next });
    },

    // Per-project prefs loaded from the DB on project open. Does NOT touch localStorage
    // (that holds the cross-project default); it just makes this project's saved prefs live.
    hydrateEditorPrefs: (prefs) => set({ editorPrefs: prefs }),
  };
}
