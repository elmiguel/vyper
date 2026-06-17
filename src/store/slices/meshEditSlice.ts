import { nanoid } from 'nanoid';
import type { Asset, CustomGeometry, SculptBrushParams } from '@/types';
import type { EditorState, MeshComponentMode, MeshEditTool, StoreSet, StoreGet } from '../editorTypes';

type MeshEditSlice = Pick<
  EditorState,
  | 'beginMeshEdit'
  | 'endMeshEdit'
  | 'setMeshComponent'
  | 'setMeshSculptBrush'
  | 'setMeshTool'
  | 'setMeshSelection'
  | 'commitMeshGeometry'
  | 'saveMeshToLibrary'
>;

/** The Modeling Studio's polygon Edit Mode. State here is view/session state — the
 *  scene's MeshEditController owns the live geometry and reports selection back via
 *  setMeshSelection; commits flow through commitMeshGeometry (recorded + persisted). */
export function createMeshEditSlice(set: StoreSet, get: StoreGet): MeshEditSlice {
  return {
    beginMeshEdit: (entityId) =>
      set({
        meshEdit: { active: true, entityId, component: 'face', selection: [], sculpt: null, tool: 'select' },
        selectedId: entityId,
      }),

    endMeshEdit: () =>
      set((s) => ({ meshEdit: { ...s.meshEdit, active: false, selection: [], sculpt: null, tool: 'select' } })),

    setMeshComponent: (mode: MeshComponentMode) =>
      // Switching component type returns to select mode (clears sculpt brush + tool).
      set((s) => ({ meshEdit: { ...s.meshEdit, component: mode, selection: [], sculpt: null, tool: 'select' } })),

    setMeshSculptBrush: (brush: SculptBrushParams | null) =>
      // Picking a sculpt brush leaves any interactive tool.
      set((s) => ({ meshEdit: { ...s.meshEdit, sculpt: brush, selection: [], tool: 'select' } })),

    setMeshTool: (tool: MeshEditTool) =>
      // Tools are mutually exclusive with the sculpt brush; clear the selection on switch.
      set((s) => ({ meshEdit: { ...s.meshEdit, tool, sculpt: null, selection: [] } })),

    setMeshSelection: (mode, keys) =>
      set((s) => ({ meshEdit: { ...s.meshEdit, component: mode, selection: keys } })),

    commitMeshGeometry: (entityId: string, geo: CustomGeometry) => {
      get().record('Edit mesh');
      const active = get().meshEdit.active;
      set((s) => ({
        entities: s.entities.map((e) =>
          e.id === entityId && e.mesh ? { ...e, mesh: { ...e.mesh, kind: 'custom', custom: geo } } : e,
        ),
        // While Edit Mode is live the controller's preview is authoritative, so don't
        // force a scene rebuild on every op; bump the revision only on the final commit.
        sceneRevision: active ? s.sceneRevision : s.sceneRevision + 1,
      }));
    },

    saveMeshToLibrary: (name: string, geo: CustomGeometry) => {
      const id = `gen-${nanoid(8)}`;
      const asset: Asset = {
        id,
        name: name || 'Mesh',
        type: 'model',
        source: 'generated',
        format: 'mesh',
        textures: [],
        geometry: geo,
      };
      get().addAsset(asset);
      return id;
    },
  };
}
