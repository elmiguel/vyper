import { HalfEdgeMesh, type V3 } from '../HalfEdgeMesh';
import { snapshotSoup, pairKey } from './soup';

/**
 * Bridge two selected edge loops with a band of quads (Blender's "Bridge Edge Loops").
 * The selected edges must form exactly two chains/rings of equal vertex count; the rings
 * are aligned (nearest start + matching direction) so the bridge doesn't twist. Takes
 * kernel edge ids; rebuilds the mesh. No-op (returns false) if the selection isn't bridgeable.
 */
export function bridgeEdges(mesh: HalfEdgeMesh, edgeIds: number[]): boolean {
  if (edgeIds.length < 2) return false;
  const soup = snapshotSoup(mesh);
  // Re-key selected kernel edges as dense vertex-pair keys.
  const keys: string[] = [];
  for (const eid of edgeIds) {
    if (!mesh.edges[eid] || mesh.edges[eid].removed) continue;
    const [ka, kb] = mesh.edgeVertices(eid);
    const a = soup.remap.get(ka);
    const b = soup.remap.get(kb);
    if (a !== undefined && b !== undefined) keys.push(pairKey(a, b));
  }
  const groups = splitEdgeLoops(keys);
  if (groups.length !== 2) return false;

  const la = orderedLoop(groups[0]);
  const lb = orderedLoop(groups[1]);
  if (!la || !lb || la.verts.length !== lb.verts.length || la.verts.length < 2) return false;

  const ringA = la.verts;
  const closed = la.closed && lb.closed;
  const aligned = alignRing(soup.verts, ringA, lb.verts, closed);
  const n = ringA.length;
  const segments = closed ? n : n - 1;
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % n;
    soup.polygons.push([ringA[i], ringA[j], aligned[j], aligned[i]]);
  }
  mesh.buildFromPolygons(soup.verts, soup.polygons);
  return true;
}

// --- internal helpers -------------------------------------------------------

/** Partition edge-pair keys into connected groups by shared vertices (union-find). */
function splitEdgeLoops(keys: string[]): string[][] {
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
  const ends = keys.map((k) => k.split('_').map(Number) as [number, number]);
  for (const [a, b] of ends) union(a, b);
  const groups = new Map<number, string[]>();
  keys.forEach((k, i) => {
    const r = find(ends[i][0]);
    const arr = groups.get(r);
    if (arr) arr.push(k);
    else groups.set(r, [k]);
  });
  return [...groups.values()];
}

interface OrderedLoop {
  verts: number[];
  closed: boolean;
}

/** Walk edge-pair keys into one ordered chain/ring, or null if they don't form one. */
function orderedLoop(keys: string[]): OrderedLoop | null {
  if (keys.length === 0) return null;
  const adj = new Map<number, number[]>();
  const link = (a: number, b: number) => {
    const arr = adj.get(a);
    if (arr) arr.push(b);
    else adj.set(a, [b]);
  };
  for (const key of keys) {
    const [a, b] = key.split('_').map(Number);
    link(a, b);
    link(b, a);
  }
  let start = -1;
  for (const [v, nb] of adj) {
    if (nb.length > 2) return null; // branch
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
      const k = pairKey(cur, nb);
      if (seen.has(k)) continue;
      next = nb;
      seen.add(k);
      break;
    }
    if (next === -1 || next === start) break;
    verts.push(next);
    prev = cur;
    cur = next;
  }
  if (seen.size !== keys.length) return null; // disjoint/leftover edges
  return { verts, closed };
}

/** Reorder ring B (rotate + maybe reverse) to line up with ring A, minimizing pair distance. */
function alignRing(verts: V3[], A: number[], B: number[], closed: boolean): number[] {
  const n = A.length;
  const score = (cand: number[]): number => {
    let s = 0;
    for (let i = 0; i < n; i++) {
      const p = verts[A[i]];
      const q = verts[cand[i]];
      s += Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
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
