import { EditableMesh, edgeKey, type ComponentMode, type EditVertex } from './EditableMesh';

/** Bounding-sphere of the given vertex ids: centroid + radius. Null if `ids` is empty. */
export function framingFor(mesh: EditableMesh, ids: number[]): { center: EditVertex; radius: number } | null {
  if (ids.length === 0) return null;
  const c = { x: 0, y: 0, z: 0 };
  for (const i of ids) {
    const v = mesh.vertices[i];
    c.x += v.x;
    c.y += v.y;
    c.z += v.z;
  }
  c.x /= ids.length;
  c.y /= ids.length;
  c.z /= ids.length;
  let radius = 0.5;
  for (const i of ids) {
    const v = mesh.vertices[i];
    radius = Math.max(radius, Math.hypot(v.x - c.x, v.y - c.y, v.z - c.z));
  }
  return { center: c, radius };
}

/**
 * Pure component-selection operators (grow/shrink, select-all, edge loop/ring) over an
 * {@link EditableMesh}. Selections are sets of string keys: a vertex index, an edge key
 * (`edgeKey`), or a face index — matching the Edit-Mode controller's convention. No
 * Babylon dependency, so the topology walks are unit-testable.
 */

/** Every component key of the given kind in the mesh. */
export function selectAll(mesh: EditableMesh, mode: ComponentMode): Set<string> {
  if (mode === 'vertex') return new Set(mesh.vertices.map((_, i) => String(i)));
  if (mode === 'face') return new Set(mesh.faces.map((_, i) => String(i)));
  return new Set([...mesh.computeEdges().keys()]);
}

/** Grow a selection by one ring of topological neighbors (adjacency-based). */
export function growSelection(mesh: EditableMesh, mode: ComponentMode, sel: Set<string>): Set<string> {
  const out = new Set(sel);
  if (mode === 'vertex') {
    const adj = mesh.vertexAdjacency();
    for (const k of sel) for (const n of adj[Number(k)] ?? []) out.add(String(n));
  } else if (mode === 'face') {
    const edges = mesh.computeEdges();
    const faceEdges = facesToEdges(mesh);
    for (const k of sel) {
      for (const ek of faceEdges[Number(k)] ?? []) {
        for (const f of edges.get(ek)?.faces ?? []) out.add(String(f));
      }
    }
  } else {
    // edges: add edges sharing a vertex with any selected edge
    const byVert = edgesByVertex(mesh);
    for (const k of sel) {
      const [a, b] = k.split('|').map(Number);
      for (const e of [...(byVert.get(a) ?? []), ...(byVert.get(b) ?? [])]) out.add(e);
    }
  }
  return out;
}

/** Shrink a selection by removing components on its boundary (inverse of grow). */
export function shrinkSelection(mesh: EditableMesh, mode: ComponentMode, sel: Set<string>): Set<string> {
  const out = new Set(sel);
  if (mode === 'vertex') {
    const adj = mesh.vertexAdjacency();
    for (const k of sel) {
      const ns = adj[Number(k)] ?? [];
      if (ns.some((n) => !sel.has(String(n)))) out.delete(k);
    }
  } else if (mode === 'face') {
    const edges = mesh.computeEdges();
    const faceEdges = facesToEdges(mesh);
    for (const k of sel) {
      const boundary = (faceEdges[Number(k)] ?? []).some((ek) =>
        (edges.get(ek)?.faces ?? []).some((f) => !sel.has(String(f))),
      );
      if (boundary) out.delete(k);
    }
  } else {
    const byVert = edgesByVertex(mesh);
    for (const k of sel) {
      const [a, b] = k.split('|').map(Number);
      const neighbors = [...(byVert.get(a) ?? []), ...(byVert.get(b) ?? [])];
      if (neighbors.some((e) => e !== k && !sel.has(e))) out.delete(k);
    }
  }
  return out;
}

/**
 * Edge ring: starting from a seed edge, the set of "parallel" edges across quad faces
 * (the opposite edge of each quad, walked both ways). Loop cut runs along a ring.
 */
export function edgeRing(mesh: EditableMesh, seedKey: string): Set<string> {
  const edges = mesh.computeEdges();
  const ring = new Set<string>([seedKey]);
  const seed = edges.get(seedKey);
  if (!seed) return ring;
  for (const startFace of seed.faces) {
    let face: number | undefined = startFace;
    let edge: [number, number] = [seed.a, seed.b];
    const guard = new Set<number>();
    while (face !== undefined && !guard.has(face)) {
      guard.add(face);
      const loop = mesh.faces[face];
      if (loop.length !== 4) break;
      const opp = oppositeEdge(loop, edge[0], edge[1]);
      if (!opp) break;
      const oppKey = edgeKey(opp[0], opp[1]);
      ring.add(oppKey);
      const next = edges.get(oppKey);
      face = next?.faces.find((f) => f !== face);
      edge = opp;
    }
  }
  return ring;
}

/**
 * Edge loop: starting from a seed edge, walk end-to-end through valence-4 vertices,
 * following the "non-adjacent, non-ring" continuation edge at each step.
 */
export function edgeLoop(mesh: EditableMesh, seedKey: string): Set<string> {
  const edges = mesh.computeEdges();
  const byVert = edgesByVertex(mesh);
  const adj = mesh.vertexAdjacency();
  const loop = new Set<string>([seedKey]);
  const seed = edges.get(seedKey);
  if (!seed) return loop;
  for (const dir of [seed.a, seed.b]) {
    let from = dir === seed.a ? seed.b : seed.a;
    let at = dir;
    const guard = new Set<string>([seedKey]);
    // Continue only through regular (valence-4) vertices.
    while ((adj[at]?.length ?? 0) === 4) {
      const next = nextLoopEdge(mesh, edges, byVert, at, from);
      if (!next || guard.has(next.key)) break;
      guard.add(next.key);
      loop.add(next.key);
      from = at;
      at = next.other;
    }
  }
  return loop;
}

/** The component key (vertex idx / edge key / face idx) nearest a local-space point
 *  within a picked face — used to resolve a raycast hit into a component selection. */
export function nearestComponentInFace(
  mesh: EditableMesh,
  mode: ComponentMode,
  faceId: number,
  local: { x: number; y: number; z: number },
): string | null {
  if (mode === 'face') return String(faceId);
  const loop = mesh.faces[faceId];
  if (!loop) return null;
  if (mode === 'vertex') {
    let best = -1;
    let bestD = Infinity;
    for (const vi of loop) {
      const v = mesh.vertices[vi];
      const d = (v.x - local.x) ** 2 + (v.y - local.y) ** 2 + (v.z - local.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = vi;
      }
    }
    return best >= 0 ? String(best) : null;
  }
  let bestKey: string | null = null;
  let bestD = Infinity;
  for (let i = 0; i < loop.length; i++) {
    const a = mesh.vertices[loop[i]];
    const b = mesh.vertices[loop[(i + 1) % loop.length]];
    const d = distToSegment(local, a, b);
    if (d < bestD) {
      bestD = d;
      bestKey = edgeKey(loop[i], loop[(i + 1) % loop.length]);
    }
  }
  return bestKey;
}

type P3 = { x: number; y: number; z: number };
function distToSegment(p: P3, a: P3, b: P3): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const len2 = abx * abx + aby * aby + abz * abz || 1e-9;
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t), p.z - (a.z + abz * t));
}

// ---- internal topology helpers --------------------------------------------

function facesToEdges(mesh: EditableMesh): string[][] {
  return mesh.faces.map((loop) => loop.map((_, i) => edgeKey(loop[i], loop[(i + 1) % loop.length])));
}

function edgesByVertex(mesh: EditableMesh): Map<number, string[]> {
  const m = new Map<number, string[]>();
  for (const e of mesh.computeEdges().values()) {
    (m.get(e.a) ?? m.set(e.a, []).get(e.a)!).push(e.key);
    (m.get(e.b) ?? m.set(e.b, []).get(e.b)!).push(e.key);
  }
  return m;
}

function oppositeEdge(loop: number[], a: number, b: number): [number, number] | null {
  if (loop.length !== 4) return null;
  const i = loop.indexOf(a);
  const j = loop.indexOf(b);
  if (i < 0 || j < 0) return null;
  const adjacent = Math.abs(i - j) === 1 || (i === 3 && j === 0) || (i === 0 && j === 3);
  if (!adjacent) return null;
  return [loop[(i + 2) % 4], loop[(j + 2) % 4]];
}

/** The next edge of a loop at vertex `at`, coming from `from`: the edge that is neither
 *  the incoming one nor shares a quad face as a ring edge (i.e. the "straight" path). */
function nextLoopEdge(
  mesh: EditableMesh,
  edges: ReturnType<EditableMesh['computeEdges']>,
  byVert: Map<number, string[]>,
  at: number,
  from: number,
): { key: string; other: number } | null {
  const incomingKey = edgeKey(at, from);
  const incoming = edges.get(incomingKey);
  // Faces that contain the incoming edge — their other edges at `at` are "side" edges
  // we must avoid (those are ring directions, not loop continuation).
  const sideVerts = new Set<number>();
  for (const fid of incoming?.faces ?? []) {
    const loop = mesh.faces[fid];
    const idx = loop.indexOf(at);
    if (idx < 0) continue;
    sideVerts.add(loop[(idx + 1) % loop.length]);
    sideVerts.add(loop[(idx - 1 + loop.length) % loop.length]);
  }
  for (const key of byVert.get(at) ?? []) {
    if (key === incomingKey) continue;
    const e = edges.get(key)!;
    const other = e.a === at ? e.b : e.a;
    if (other === from || sideVerts.has(other)) continue;
    return { key, other };
  }
  return null;
}
