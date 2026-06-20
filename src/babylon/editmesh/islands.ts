import type { HalfEdgeMesh, V3 } from '@/kernel/HalfEdgeMesh';

/**
 * Island (connected-component) helpers + object grouping for kernel Edit Mode, shared by the
 * (retiring) Modeling Studio and the scene editor. A single editing mesh can hold several
 * disconnected islands; grouping lets the user treat a set of them as one object. Identity is
 * tracked by each island's **centroid** (kernel ids are reassigned on every edit), re-resolved
 * after a rebuild. Pure (kernel + math only); relocated here from the studio's modelerFocus /
 * modelerGroups so the editor doesn't depend on src/modeler.
 */

/** Centroid of an island's vertices (deduped). [0,0,0] for an empty set. */
export function islandCentroid(mesh: HalfEdgeMesh, faces: number[]): V3 {
  const seen = new Set<number>();
  let x = 0, y = 0, z = 0;
  for (const f of faces) {
    if (!mesh.faces[f] || mesh.faces[f].removed) continue;
    for (const v of mesh.faceVertices(f)) {
      if (seen.has(v)) continue;
      seen.add(v);
      const p = mesh.vertices[v].position;
      x += p[0]; y += p[1]; z += p[2];
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

/** The island whose centroid is nearest `centroid` (re-identifies an island after ids changed). */
export function nearestIslandTo(mesh: HalfEdgeMesh, centroid: V3): number[] {
  let best: number[] = [];
  let bestD = Infinity;
  for (const isl of allIslands(mesh)) {
    const c = islandCentroid(mesh, isl);
    const d = (c[0] - centroid[0]) ** 2 + (c[1] - centroid[1]) ** 2 + (c[2] - centroid[2]) ** 2;
    if (d < bestD) { bestD = d; best = isl; }
  }
  return best;
}

const EPS2 = 1e-8;
function near(a: V3, b: V3): boolean {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2 < EPS2;
}

/**
 * Groups of islands that focus/select/transform as one. Holds, per group, the centroids of its
 * member islands (the stable handle across edits); {@link refresh} re-syncs them after a rebuild.
 */
export class ObjectGroups {
  private groups: V3[][] = [];

  clear(): void {
    this.groups = [];
  }

  /** Whether the island containing `faceId` is part of a multi-object group. */
  isGrouped(mesh: HalfEdgeMesh, faceId: number): boolean {
    return this.groupOf(islandCentroid(mesh, mesh.faceIsland(faceId))) !== null;
  }

  /** The islands (face-lists) to select when the island containing `faceId` is picked: the whole
   *  group if it belongs to one, otherwise just that island. */
  islandsForFocus(mesh: HalfEdgeMesh, faceId: number): number[][] {
    const island = mesh.faceIsland(faceId);
    const group = this.groupOf(islandCentroid(mesh, island));
    if (!group) return [island];
    return group.map((c) => nearestIslandTo(mesh, c)).filter((i) => i.length);
  }

  /** Group every island touched by `faces` into one (needs ≥2 distinct islands). */
  group(mesh: HalfEdgeMesh, faces: number[]): void {
    const centroids = this.islandCentroidsOf(mesh, faces);
    if (centroids.length < 2) return;
    this.dropOverlapping(centroids);
    this.groups.push(centroids);
  }

  /** Remove the group(s) the islands touched by `faces` belong to. */
  ungroup(mesh: HalfEdgeMesh, faces: number[]): void {
    this.dropOverlapping(this.islandCentroidsOf(mesh, faces));
  }

  /** Re-sync member centroids to the current mesh after a rebuild; drop emptied/degenerate groups. */
  refresh(mesh: HalfEdgeMesh): void {
    this.groups = this.groups
      .map((g) => g.map((c) => islandCentroid(mesh, nearestIslandTo(mesh, c))).filter((c) => isFinite(c[0])))
      .filter((g) => g.length >= 2);
  }

  private islandCentroidsOf(mesh: HalfEdgeMesh, faces: number[]): V3[] {
    const out: V3[] = [];
    const seenFace = new Set<number>();
    for (const f of faces) {
      if (seenFace.has(f) || !mesh.faces[f] || mesh.faces[f].removed) continue;
      const island = mesh.faceIsland(f);
      for (const g of island) seenFace.add(g);
      out.push(islandCentroid(mesh, island));
    }
    return out;
  }

  private groupOf(c: V3): V3[] | null {
    for (const g of this.groups) if (g.some((m) => near(m, c))) return g;
    return null;
  }

  private dropOverlapping(centroids: V3[]): void {
    this.groups = this.groups.filter((g) => !g.some((m) => centroids.some((c) => near(m, c))));
  }
}
