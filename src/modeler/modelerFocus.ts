import type { HalfEdgeMesh, V3 } from '@/kernel/HalfEdgeMesh';

/** Centroid of an island's vertices (deduped). [0,0,0] for an empty set. */
export function islandCentroid(mesh: HalfEdgeMesh, faces: number[]): V3 {
  const seen = new Set<number>();
  let x = 0;
  let y = 0;
  let z = 0;
  for (const f of faces) {
    if (!mesh.faces[f] || mesh.faces[f].removed) continue;
    for (const v of mesh.faceVertices(f)) {
      if (seen.has(v)) continue;
      seen.add(v);
      const p = mesh.vertices[v].position;
      x += p[0];
      y += p[1];
      z += p[2];
    }
  }
  const n = seen.size || 1;
  return [x / n, y / n, z / n];
}

/** All connected components (islands) of the mesh, each as a list of kernel face ids. */
export function allIslands(mesh: HalfEdgeMesh): number[][] {
  const seen = new Set<number>();
  const out: number[][] = [];
  for (const f of mesh.liveFaces()) {
    if (seen.has(f)) continue;
    const isl = mesh.faceIsland(f);
    for (const g of isl) seen.add(g);
    out.push(isl);
  }
  return out;
}

/** The island whose centroid is nearest `centroid` (re-identifies an island after a rebuild
 *  reassigned ids). Empty if the mesh has no faces. */
export function nearestIslandTo(mesh: HalfEdgeMesh, centroid: V3): number[] {
  let best: number[] = [];
  let bestD = Infinity;
  for (const isl of allIslands(mesh)) {
    const c = islandCentroid(mesh, isl);
    const d = (c[0] - centroid[0]) ** 2 + (c[1] - centroid[1]) ** 2 + (c[2] - centroid[2]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = isl;
    }
  }
  return best;
}

/**
 * The active (focused) object in the Modeling Studio — one or more connected islands of the
 * single editing mesh (more than one when a group is focused). Component picking/editing locks
 * to it; other islands are dimmed + ignored.
 *
 * The kernel reassigns ids on every edit (rebuild), so identity is tracked by each member
 * island's **centroid**: after a rebuild {@link refresh} re-finds the nearest island for each
 * anchor. Islands are spatially distinct, so this is robust.
 */
export class ActiveObject {
  /** Kernel face ids of the active object (across all member islands). */
  readonly faces = new Set<number>();
  /** Kernel vertex ids of the active object (for fast membership tests). */
  readonly verts = new Set<number>();
  /** One centroid per member island, for re-identification after a rebuild. */
  private anchors: V3[] = [];

  /** Whether an object is currently focused. */
  get isSet(): boolean {
    return this.anchors.length > 0;
  }

  clear(): void {
    this.faces.clear();
    this.verts.clear();
    this.anchors = [];
  }

  /** Focus the island containing `faceId` (a single object). */
  setFromFace(mesh: HalfEdgeMesh, faceId: number): void {
    this.assign(mesh, [mesh.faceIsland(faceId)]);
  }

  /** Focus a set of islands (e.g. all members of a group). */
  setIslands(mesh: HalfEdgeMesh, islands: number[][]): void {
    this.assign(mesh, islands.filter((i) => i.length));
  }

  /** Re-identify the active islands after a rebuild by nearest centroid (ids changed). */
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
      if (isl.length === 0 || claimed.has(isl[0])) continue; // two anchors resolved to one island
      this.anchors.push(islandCentroid(mesh, isl));
      for (const f of isl) {
        claimed.add(f);
        this.faces.add(f);
        for (const v of mesh.faceVertices(f)) this.verts.add(v);
      }
    }
  }
}
