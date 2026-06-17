import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { GAME_CAMERA_ID } from './editorObjects';

/** A tracked scene slot owns the live mesh for an entity id (SceneManager.tracked). */
interface MeshSlot {
  mesh?: AbstractMesh;
}

/** True for the game-camera helper rig (its body or any child, named `cam` / `cam:*`). */
export function isCameraHelperMesh(m: AbstractMesh): boolean {
  return m.name === GAME_CAMERA_ID || m.name.startsWith(`${GAME_CAMERA_ID}:`);
}

/** The selection id for a picked mesh: the camera helper, the model child's
 *  tagged `entityId`, or the mesh name (which equals the entity id for primitives). */
export function idForMesh(m: AbstractMesh): string {
  if (isCameraHelperMesh(m)) return GAME_CAMERA_ID;
  return (m.metadata as { entityId?: string } | null)?.entityId ?? m.name;
}

/** A mesh is selectable if it's a tracked entity mesh, a child of a placed model
 *  (tagged with metadata.entityId), or the camera helper. */
export function isPickable(m: AbstractMesh, tracked: Map<string, MeshSlot>): boolean {
  if (isCameraHelperMesh(m)) return true;
  const metaId = (m.metadata as { entityId?: string } | null)?.entityId;
  if (metaId) return tracked.has(metaId);
  return tracked.has(m.name) && tracked.get(m.name)!.mesh === m;
}

/** Ordered, de-duplicated entity ids from raw pick hits (nearest first). A model's
 *  child meshes all collapse to its one entity id. */
export function pickIdsFromHits(hits: { pickedMesh: AbstractMesh | null; distance: number }[]): string[] {
  const ids: string[] = [];
  for (const h of [...hits].sort((a, b) => a.distance - b.distance)) {
    if (!h.pickedMesh) continue;
    const id = idForMesh(h.pickedMesh);
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

/**
 * Choose which entity to select from the ids under the cursor (nearest-first).
 * Clicking the same screen spot again advances to the next object behind the
 * current selection, so overlapping/stacked objects can each be reached.
 */
export function nextPick(ids: string[], selectedId: string | null, samePoint: boolean): string | null {
  if (!ids.length) return null;
  if (samePoint && selectedId && ids.includes(selectedId)) {
    return ids[(ids.indexOf(selectedId) + 1) % ids.length];
  }
  return ids[0];
}
