import type { ModelerState } from './modelerStore';
import type { EditActionsCtx } from './modelerEditActions';
import type { SelectionBounds } from './selectionBounds';
import { extractFacesGeometry } from '@/kernel/render';
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
> {
  /** Faces of the focused object, or null when no whole object is selected (Object mode). */
  const focusedFaces = (): number[] | null => {
    const s = ctx.get();
    return s.component === 'object' && s.selection.length > 0 ? s.selection : null;
  };

  return {
    selectedObjectAssetId: () => {
      const faces = focusedFaces();
      if (!faces) return null;
      const ent = meshEntity();
      return ent?.mesh?.objectAssets?.[islandKey(ctx.get().selectionBounds())] ?? null;
    },

    makeSelectedObjectAsset: () => {
      const faces = focusedFaces();
      if (!faces) return null;
      const ent = meshEntity();
      if (!ent || !ent.mesh) return null;
      const geo = extractFacesGeometry(ctx.mesh(), faces);
      const ed = useEditorStore.getState();
      const id = ed.saveModelerObjectAsset(ent.name || 'Object', geo, ent.mesh.material, ent.mesh.color);
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
