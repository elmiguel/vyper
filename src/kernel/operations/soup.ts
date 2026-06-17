import { HalfEdgeMesh, type V3 } from '../HalfEdgeMesh';

/**
 * The polygon-soup view of a kernel mesh that operations mutate: dense vertex positions,
 * face loops (dense vertex indices), and a kernel-vertex-id → dense-index remap. Mirrors
 * the snapshot block in {@link extrudeFaces}; operations mutate `verts`/`polygons` then
 * call {@link HalfEdgeMesh.buildFromPolygons} to re-link a valid half-edge structure.
 */
export interface Soup {
  verts: V3[];
  polygons: number[][];
  /** kernel vertex id → dense index in `verts`. */
  remap: Map<number, number>;
  /** dense polygon index → kernel face id (the order faces were snapshotted in). */
  liveFaces: number[];
}

/** Snapshot a kernel mesh into a mutable polygon soup (dense indices). */
export function snapshotSoup(mesh: HalfEdgeMesh): Soup {
  const remap = new Map<number, number>();
  const verts: V3[] = [];
  mesh.vertices.forEach((v, i) => {
    if (v.removed) return;
    remap.set(i, verts.length);
    verts.push([...v.position]);
  });
  const liveFaces = mesh.liveFaces();
  const polygons = liveFaces.map((f) => mesh.faceVertices(f).map((vi) => remap.get(vi)!));
  return { verts, polygons, remap, liveFaces };
}

/** Order-independent key for an undirected dense-vertex pair. */
export function pairKey(a: number, b: number): string {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

/** The dense polygon indices for a set of kernel face ids (via the snapshot's liveFaces). */
export function denseFaceSet(soup: Soup, faceIds: number[]): Set<number> {
  const want = new Set(faceIds);
  const out = new Set<number>();
  soup.liveFaces.forEach((kf, dense) => {
    if (want.has(kf)) out.add(dense);
  });
  return out;
}

/** Drop vertices no polygon references, remapping the face loops to the dense survivors. */
export function compactSoup(verts: V3[], polygons: number[][]): { verts: V3[]; polygons: number[][] } {
  const used = new Set<number>();
  for (const loop of polygons) for (const vi of loop) used.add(vi);
  const remap = new Map<number, number>();
  const out: V3[] = [];
  verts.forEach((v, i) => {
    if (used.has(i)) {
      remap.set(i, out.length);
      out.push([...v]);
    }
  });
  return { verts: out, polygons: polygons.map((loop) => loop.map((vi) => remap.get(vi)!)) };
}

/** Sub-loop of `loop` from index `from` to index `to` inclusive, walking forward. */
export function sliceLoop(loop: number[], from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; ; i = (i + 1) % loop.length) {
    out.push(loop[i]);
    if (i === to) break;
  }
  return out;
}
