import { nanoid } from 'nanoid';
import type { Asset, CustomGeometry, MaterialConfig, SculptBrushParams } from '@/types';
import type { EditorState, MeshComponentMode, MeshEditTool, StoreSet, StoreGet } from '../editorTypes';
import { ASSET_ROOT } from './assetSlice';

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
  | 'saveModelerObjectAsset'
>;

/** Texture-map URLs referenced by a material (base/normal/rough/AO/emissive). */
function materialMapUrls(m: MaterialConfig | undefined): string[] {
  if (!m) return [];
  return [m.baseColorMap, m.normalMap, m.roughnessMap, m.aoMap, m.emissiveMap].filter((u): u is string => !!u);
}

/** The served URL of a texture asset (rootUrl + first texture filename). */
function textureUrlOf(a: Asset): string {
  return `${a.rootUrl ?? ASSET_ROOT}${a.textures[0] ?? ''}`;
}

/** A lightweight texture asset for a served URL not already in the library (so an object's
 *  custom maps travel with it). Splits the URL into a root + filename. */
function textureAssetFromUrl(url: string): Asset {
  const slash = url.lastIndexOf('/');
  const rootUrl = slash >= 0 ? url.slice(0, slash + 1) : ASSET_ROOT;
  const file = slash >= 0 ? url.slice(slash + 1) : url;
  const dot = file.lastIndexOf('.');
  return {
    id: `gen-tex-${nanoid(8)}`,
    name: file || 'Texture',
    type: 'texture',
    source: 'generated',
    format: dot >= 0 ? file.slice(dot + 1) : 'png',
    rootUrl,
    textures: [file],
  };
}

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

    saveModelerObjectAsset: (name, geo, material, color) => {
      const id = `gen-${nanoid(8)}`;
      const maps = materialMapUrls(material);
      const asset: Asset = {
        id,
        name: name || 'Object',
        type: 'model',
        source: 'generated',
        format: 'mesh',
        textures: maps.map((u) => u.slice(u.lastIndexOf('/') + 1)),
        geometry: geo,
        meshMaterial: material,
        meshColor: color,
      };
      get().addAsset(asset);
      // Ensure any texture the object uses is itself in the library (custom maps travel with it).
      const have = new Set(get().assetLibrary.assets.filter((a) => a.type === 'texture').map(textureUrlOf));
      for (const url of maps) {
        if (!have.has(url)) get().addAsset(textureAssetFromUrl(url));
      }
      return id;
    },
  };
}
