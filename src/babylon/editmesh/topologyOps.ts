import { EditableMesh, edgeKey } from './EditableMesh';
import type { OpResult } from './meshOps';

/**
 * Connect selected vertices with new edges, splitting each face that contains exactly
 * two of them (Blender's "J" / Connect Vertex Path). The two verts must be non-adjacent
 * in the face (an edge already exists otherwise); the face is split into two along the
 * chord. Faces with fewer than two — or already-adjacent — selected verts are untouched.
 */
export function connectVertices(mesh: EditableMesh, vertexIds: Iterable<number>): OpResult {
  const sel = new Set(vertexIds);
  if (sel.size < 2) return { faces: [], vertices: [] };
  const newFaces: number[] = [];
  // Snapshot length: faces appended by addFace below must not be re-scanned.
  const count = mesh.faces.length;
  for (let fid = 0; fid < count; fid++) {
    const loop = mesh.faces[fid];
    const hits = loop.map((vi, i) => ({ vi, i })).filter((p) => sel.has(p.vi));
    if (hits.length !== 2) continue;
    const [p, q] = hits;
    const gap = Math.abs(p.i - q.i);
    if (gap === 1 || gap === loop.length - 1) continue; // already an edge
    const f1 = sliceLoop(loop, p.i, q.i);
    const f2 = sliceLoop(loop, q.i, p.i);
    if (f1.length < 3 || f2.length < 3) continue;
    mesh.faces[fid] = f1;
    newFaces.push(fid, mesh.addFace(f2));
  }
  return { faces: newFaces, vertices: [] };
}

/**
 * Bridge two selected edge loops with a band of quads (Blender's "Bridge Edge Loops").
 * Each set of edge keys must form a single chain/ring with the same vertex count; the
 * rings are aligned (nearest start + matching direction) so the bridge doesn't twist.
 */
export function bridgeEdgeLoops(mesh: EditableMesh, edgeKeysA: string[], edgeKeysB: string[]): OpResult {
  const la = orderedLoopFromEdges(edgeKeysA);
  const lb = orderedLoopFromEdges(edgeKeysB);
  if (!la || !lb || la.verts.length !== lb.verts.length || la.verts.length < 2) {
    return { faces: [], vertices: [] };
  }
  const ringA = la.verts;
  const closed = la.closed && lb.closed;
  const aligned = alignRing(mesh, ringA, lb.verts, closed);
  const n = ringA.length;
  const segments = closed ? n : n - 1;
  const newFaces: number[] = [];
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % n;
    newFaces.push(mesh.addFace([ringA[i], ringA[j], aligned[j], aligned[i]]));
  }
  return { faces: newFaces, vertices: [] };
}

/**
 * Partition a flat set of edge keys into connected groups (loops) by shared vertices.
 * Used by the bridge tool to split a single edge selection into the two loops to bridge.
 */
export function splitEdgeLoops(edgeKeys: string[]): string[][] {
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    let p = parent.get(x);
    if (p === undefined) {
      parent.set(x, x);
      return x;
    }
    while (p !== x) {
      x = p;
      p = parent.get(x)!;
    }
    return x;
  };
  const union = (a: number, b: number) => parent.set(find(a), find(b));
  const ends = edgeKeys.map((k) => k.split('|').map(Number) as [number, number]);
  for (const [a, b] of ends) union(a, b);
  const groups = new Map<number, string[]>();
  edgeKeys.forEach((k, i) => {
    const r = find(ends[i][0]);
    const arr = groups.get(r);
    if (arr) arr.push(k);
    else groups.set(r, [k]);
  });
  return [...groups.values()];
}

// --- internal helpers -------------------------------------------------------

/** Sub-loop of `loop` from index `from` to index `to` inclusive, walking forward. */
function sliceLoop(loop: number[], from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; ; i = (i + 1) % loop.length) {
    out.push(loop[i]);
    if (i === to) break;
  }
  return out;
}

/** An ordered vertex ring/chain recovered from a set of selected edge keys. */
interface OrderedLoop {
  verts: number[];
  /** True when the chain closes back on itself (a ring), false for an open chain. */
  closed: boolean;
}

/** Walk a set of edge keys into one ordered chain/ring, or null if they don't form one
 *  (a branch, a gap, or two disjoint loops). Endpoints are parsed from the key ("a|b"),
 *  so this works for boundary edges even before any bridging face exists. */
function orderedLoopFromEdges(edgeKeys: string[]): OrderedLoop | null {
  if (edgeKeys.length === 0) return null;
  const adj = new Map<number, number[]>();
  const link = (a: number, b: number) => {
    const arr = adj.get(a);
    if (arr) arr.push(b);
    else adj.set(a, [b]);
  };
  for (const key of edgeKeys) {
    const [a, b] = key.split('|').map(Number);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    link(a, b);
    link(b, a);
  }
  let start = -1;
  for (const [v, nb] of adj) {
    if (nb.length > 2) return null; // branch → not a simple loop
    if (nb.length === 1 && start === -1) start = v;
  }
  const closed = start === -1;
  if (closed) start = adj.keys().next().value as number;
  const verts = [start];
  const seen = new Set<string>();
  let cur = start;
  let prev = -1;
  for (;;) {
    let next = -1;
    for (const nb of adj.get(cur) ?? []) {
      if (nb === prev) continue;
      const k = edgeKey(cur, nb);
      if (seen.has(k)) continue;
      next = nb;
      seen.add(k);
      break;
    }
    if (next === -1) break;
    if (next === start) break; // ring closed
    verts.push(next);
    prev = cur;
    cur = next;
  }
  if (seen.size !== edgeKeys.length) return null; // leftover/disjoint edges
  return { verts, closed };
}

/** Reorder ring B (rotate + maybe reverse) to line up with ring A, minimizing the total
 *  vertex-pair distance so a bridge connects nearest points without twisting. */
function alignRing(mesh: EditableMesh, A: number[], B: number[], closed: boolean): number[] {
  const n = A.length;
  const score = (cand: number[]): number => {
    let s = 0;
    for (let i = 0; i < n; i++) {
      const p = mesh.vertices[A[i]];
      const q = mesh.vertices[cand[i]];
      s += Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
    }
    return s;
  };
  const candidates: number[][] = [];
  const rotations = closed ? n : 1;
  for (let r = 0; r < rotations; r++) {
    const fwd: number[] = [];
    const rev: number[] = [];
    for (let i = 0; i < n; i++) {
      fwd.push(B[(r + i) % n]);
      rev.push(B[(r - i + n) % n]);
    }
    candidates.push(fwd, rev);
  }
  let best = candidates[0];
  let bestScore = Infinity;
  for (const c of candidates) {
    const s = score(c);
    if (s < bestScore) {
      bestScore = s;
      best = c;
    }
  }
  return best;
}
