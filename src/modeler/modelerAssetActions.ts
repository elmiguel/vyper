import type { HalfEdgeMesh } from '@/kernel/HalfEdgeMesh';
import type { ModelerState } from './modelerStore';
import type { EditActionsCtx } from './modelerEditActions';
import { selectionBounds, type SelectionBounds } from './selectionBounds';
import { allIslands } from './modelerFocus';
import { extractFacesGeometry } from '@/kernel/render';
import { computeBoxUVs } from './modelerSceneGeom';
import { useEditorStore } from '@/store/editorStore';

/** Stable-ish key for a focused object (island) within the single modeler mesh: its centroid
 *  rounded to 2 decimals. Survives save/reload (geometry is restored) and keeps the asset link
 *  unless the island is moved. */
function islandKey(b: SelectionBounds): string {
  return b.center.map((n) => n.toFixed(2)).join(',');
}

/** Distinct kernel vertex ids touched by a set of faces. */
function islandVerts(mesh: HalfEdgeMesh, faces: number[]): number[] {
  const set = new Set<number>();
  for (const f of faces) for (const v of mesh.faceVertices(f)) set.add(v);
  return [...set];
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
  | 'setSelectedObjectReference' | 'selectedObjectIsReference' | 'republishLinkedObjects'
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

    republishLinkedObjects: () => {
      // Re-extract every object that was exported to an asset and update that asset in place, so
      // editing the source object propagates to its asset (and to linked instances on next load).
      // Each link is re-matched to the island whose centroid is now nearest its stored key (the
      // object may have shifted while editing); the key map is rebuilt from the new centroids.
      const ent = meshEntity();
      const map = ent?.mesh?.objectAssets;
      if (!ent?.mesh || !map || Object.keys(map).length === 0) return;
      const mesh = ctx.mesh();
      const ed = useEditorStore.getState();
      const islands = allIslands(mesh).map((faces) => ({ faces, center: selectionBounds(mesh, islandVerts(mesh, faces)).center }));
      if (islands.length === 0) return;
      const next: Record<string, string> = {};
      for (const [key, assetId] of Object.entries(map)) {
        const [tx, ty, tz] = key.split(',').map(Number);
        let best = islands[0];
        let bestD = Infinity;
        for (const isl of islands) {
          const d = (isl.center[0] - tx) ** 2 + (isl.center[1] - ty) ** 2 + (isl.center[2] - tz) ** 2;
          if (d < bestD) { bestD = d; best = isl; }
        }
        const geo = extractFacesGeometry(mesh, best.faces);
        geo.uvs = computeBoxUVs(geo.positions, geo.normals);
        ed.saveModelerObjectAsset(ent.name || 'Object', geo, ent.mesh.material, ent.mesh.color, assetId);
        next[islandKey(selectionBounds(mesh, islandVerts(mesh, best.faces)))] = assetId;
      }
      ed.updateMesh(ent.id, { objectAssets: next });
    },
  };
}
