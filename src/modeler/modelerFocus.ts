import type { HalfEdgeMesh, V3 } from '@/kernel/HalfEdgeMesh';
import { islandCentroid, nearestIslandTo } from '@/babylon/editmesh/islands';

// Island helpers now live in babylon/editmesh/islands (shared with the scene editor); re-exported
// here for the Studio modules that import them from this path until it's retired.
export { islandCentroid, allIslands, nearestIslandTo } from '@/babylon/editmesh/islands';

/**
 * The active (focused) object in the Modeling Studio — one or more connected islands of the
 * single editing mesh (more than one when a group is focused). Component picking/editing locks
 * to it; other islands are dimmed + ignored. Identity is tracked per member island by its
 * **centroid** (kernel ids change on every rebuild); {@link refresh} re-finds the nearest island.
 */
export class ActiveObject {
  readonly faces = new Set<number>();
  readonly verts = new Set<number>();
  private anchors: V3[] = [];

  get isSet(): boolean {
    return this.anchors.length > 0;
  }

  clear(): void {
    this.faces.clear();
    this.verts.clear();
    this.anchors = [];
  }

  setFromFace(mesh: HalfEdgeMesh, faceId: number): void {
    this.assign(mesh, [mesh.faceIsland(faceId)]);
  }

  setIslands(mesh: HalfEdgeMesh, islands: number[][]): void {
    this.assign(mesh, islands.filter((i) => i.length));
  }

  refresh(mesh: HalfEdgeMesh): void {
    if (!this.anchors.length) return;
    const islands = this.anchors.map((c) => nearestIslandTo(mesh, c)).filter((i) => i.length);
    if (islands.length) this.assign(mesh, islands);
    else this.clear();
  }

  private assign(mesh: HalfEdgeMesh, islands: number[][]): void {
    this.faces.clear();
    this.verts.clear();
    this.anchors = [];
    const claimed = new Set<number>();
    for (const isl of islands) {
      if (isl.length === 0 || claimed.has(isl[0])) continue;
      this.anchors.push(islandCentroid(mesh, isl));
      for (const f of isl) {
        claimed.add(f);
        this.faces.add(f);
        for (const v of mesh.faceVertices(f)) this.verts.add(v);
      }
    }
  }
}
