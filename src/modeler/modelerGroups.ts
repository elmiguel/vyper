import type { HalfEdgeMesh, V3 } from '@/kernel/HalfEdgeMesh';
import { islandCentroid, nearestIslandTo } from './modelerFocus';

/** Two centroids are "the same island" when within this distance (they're recomputed the same
 *  way from the same mesh, so a match is effectively exact; the epsilon just absorbs FP noise). */
const EPS2 = 1e-8;

/**
 * Groups of objects (islands) that focus/select/transform as one unit. The mesh has no native
 * grouping — this registry holds, per group, the **centroids** of its member islands (ids are
 * reassigned on every edit, so centroids are the stable handle; {@link refresh} re-syncs them
 * after each rebuild). Islands not in any group are their own implicit objects.
 */
export class ObjectGroups {
  /** Each group: the centroids of its member islands. */
  private groups: V3[][] = [];

  clear(): void {
    this.groups = [];
  }

  /** Whether the island containing `faceId` is part of a multi-object group. */
  isGrouped(mesh: HalfEdgeMesh, faceId: number): boolean {
    return this.groupOf(islandCentroid(mesh, mesh.faceIsland(faceId))) !== null;
  }

  /** The islands (face-lists) to focus when the island containing `faceId` is clicked: the
   *  whole group if it belongs to one, otherwise just that island. */
  islandsForFocus(mesh: HalfEdgeMesh, faceId: number): number[][] {
    const island = mesh.faceIsland(faceId);
    const group = this.groupOf(islandCentroid(mesh, island));
    if (!group) return [island];
    return group.map((c) => nearestIslandTo(mesh, c)).filter((i) => i.length);
  }

  /** Group every island touched by `faces` into one (needs ≥2 distinct islands). Any existing
   *  group overlapping them is replaced. */
  group(mesh: HalfEdgeMesh, faces: number[]): void {
    const centroids = this.islandCentroidsOf(mesh, faces);
    if (centroids.length < 2) return;
    this.dropOverlapping(centroids);
    this.groups.push(centroids);
  }

  /** Remove the group(s) the islands touched by `faces` belong to (back to separate objects). */
  ungroup(mesh: HalfEdgeMesh, faces: number[]): void {
    this.dropOverlapping(this.islandCentroidsOf(mesh, faces));
  }

  /** Re-sync member centroids to the current mesh after a rebuild; drop emptied/degenerate groups. */
  refresh(mesh: HalfEdgeMesh): void {
    this.groups = this.groups
      .map((g) => g.map((c) => islandCentroid(mesh, nearestIslandTo(mesh, c))).filter((c) => isFinite(c[0])))
      .filter((g) => g.length >= 2);
  }

  // --- internals -------------------------------------------------------------

  /** Unique member-island centroids for all islands the given faces touch. */
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

  /** The group containing a member centroid ~equal to `c`, or null. */
  private groupOf(c: V3): V3[] | null {
    for (const g of this.groups) {
      if (g.some((m) => near(m, c))) return g;
    }
    return null;
  }

  /** Drop every group that shares a member island with any of `centroids`. */
  private dropOverlapping(centroids: V3[]): void {
    this.groups = this.groups.filter((g) => !g.some((m) => centroids.some((c) => near(m, c))));
  }
}

function near(a: V3, b: V3): boolean {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2 < EPS2;
}
