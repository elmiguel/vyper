import type { EditorState, StoreSet, Workspace } from '../editorTypes';
import { DEFAULT_PRESET_ID } from '@/layout/workspacePresets';

type WorkspaceSlice = Pick<
  EditorState,
  | 'setWorkspaceLayout'
  | 'setActivePreset'
  | 'saveCustomLayout'
  | 'deleteCustomLayout'
  | 'hydrateWorkspace'
>;

/** Fresh workspace: no saved arrangement yet, the Default preset active. */
export function defaultWorkspace(): Workspace {
  return { layout: null, custom: [], activePresetId: DEFAULT_PRESET_ID };
}

let customSeq = 0;

/** Dockable workspace: persist the live arrangement and manage saved presets. */
export function createWorkspaceSlice(set: StoreSet): WorkspaceSlice {
  return {
    setWorkspaceLayout: (layout) => set((s) => ({ workspace: { ...s.workspace, layout } })),

    setActivePreset: (id) => set((s) => ({ workspace: { ...s.workspace, activePresetId: id } })),

    saveCustomLayout: (label, layout) => {
      const id = `custom-${++customSeq}-${label.replace(/\s+/g, '-').toLowerCase()}`;
      set((s) => ({
        workspace: {
          ...s.workspace,
          layout,
          activePresetId: id,
          custom: [...s.workspace.custom, { id, label, layout }],
        },
      }));
      return id;
    },

    deleteCustomLayout: (id) =>
      set((s) => ({
        workspace: {
          ...s.workspace,
          custom: s.workspace.custom.filter((c) => c.id !== id),
          // If we deleted the active layout, fall back to the Default preset.
          activePresetId: s.workspace.activePresetId === id ? DEFAULT_PRESET_ID : s.workspace.activePresetId,
        },
      })),

    hydrateWorkspace: (workspace) => set({ workspace }),
  };
}
