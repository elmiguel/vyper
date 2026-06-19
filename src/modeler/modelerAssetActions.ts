import type { ModelerState } from './modelerStore';
import type { EditActionsCtx } from './modelerEditActions';
import type { SelectionBounds } from './selectionBounds';
import { extractFacesGeometry } from '@/kernel/render';
import { computeBoxUVs } from './modelerSceneGeom';
import { useEditorStore } from '@/store/editorStore';

/** Stable-ish key for a focused object (island) within the single modeler mesh: its centroid
 *  rounded to 2 decimals. Survives save/reload (geometry is restored) and keeps the asset link
 *  unless the island is moved. */
function islandKey(b: SelectionBounds): string {
  return b.center.map((n) => n.toFixed(2)).join(',');
}

/** The project mesh entity the modeler mirrors into (also holds colour + material). */
function meshEntity() {
  return useEditorStore.getState().entities.find((e) => e.mesh);
}

/**
 * "Make asset" actions for the Modeling Studio Inspector: export the currently focused object
 * (island, in Object mode) to the asset library as a generated model — geometry plus the mesh's
 * material/colour, ensuring its textures are in the library too — and remember the link on the
 * entity so the toggle reflects state. Only the selected island is exported (not the whole mesh).
 */
export function createAssetActions(ctx: EditActionsCtx): Pick<
  ModelerState,
  'makeSelectedObjectAsset' | 'removeSelectedObjectAsset' | 'selectedObjectAssetId'
  | 'setSelectedObjectReference' | 'selectedObjectIsReference'
> {
  /** Faces of the focused object, or null when no whole object is selected (Object mode). */
  const focusedFaces = (): number[] | null => {
    const s = ctx.get();
    return s.component === 'object' && s.selection.length > 0 ? s.selection : null;
  };

  /** The asset id the focused object is currently linked to, or null. */
  const linkedId = (): string | null => {
    if (!focusedFaces()) return null;
    const ent = meshEntity();
    return ent?.mesh?.objectAssets?.[islandKey(ctx.get().selectionBounds())] ?? null;
  };

  return {
    selectedObjectAssetId: linkedId,

    selectedObjectIsReference: () => {
      const id = linkedId();
      if (!id) return false;
      return !!useEditorStore.getState().assetLibrary.assets.find((a) => a.id === id)?.reference;
    },

    setSelectedObjectReference: (on) => {
      const id = linkedId();
      if (id) useEditorStore.getState().updateAsset(id, { reference: on });
    },

    makeSelectedObjectAsset: () => {
      const faces = focusedFaces();
      if (!faces) return null;
      const ent = meshEntity();
      if (!ent || !ent.mesh) return null;
      const geo = extractFacesGeometry(ctx.mesh(), faces);
      // The kernel has no UVs, so bake box/tri-planar UVs into the saved geometry — otherwise
      // the asset's textures have nowhere to map (renders flat/black in the scene + preview).
      if (!geo.uvs?.length) geo.uvs = computeBoxUVs(geo.positions, geo.normals);
      const ed = useEditorStore.getState();
      // Re-run on an already-exported object republishes in place (keeps id + reference flag),
      // so linked instances pick up the edit on their next load.
      const existing = linkedId();
      const id = ed.saveModelerObjectAsset(ent.name || 'Object', geo, ent.mesh.material, ent.mesh.color, existing ?? undefined);
      // Register the object's material as a reusable preset so it shows in the Material dropdown
      // (reused by name, so repeated saves update rather than duplicate).
      if (ent.mesh.material) ed.saveMaterialPreset(`${ent.name || 'Object'} material`, ent.mesh.material);
      const key = islandKey(ctx.get().selectionBounds());
      ed.updateMesh(ent.id, { objectAssets: { ...(ent.mesh.objectAssets ?? {}), [key]: id } });
      return id;
    },

    removeSelectedObjectAsset: () => {
      const faces = focusedFaces();
      if (!faces) return;
      const ent = meshEntity();
      if (!ent || !ent.mesh) return;
      const key = islandKey(ctx.get().selectionBounds());
      const map = { ...(ent.mesh.objectAssets ?? {}) };
      const id = map[key];
      delete map[key];
      const ed = useEditorStore.getState();
      ed.updateMesh(ent.id, { objectAssets: map });
      if (id) ed.deleteAsset(id);
    },
  };
}
