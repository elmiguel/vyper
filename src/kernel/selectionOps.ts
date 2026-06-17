import { HalfEdgeMesh } from './HalfEdgeMesh';

/** Component kind a selection is in (object mode has no per-component selection). */
export type Comp = 'vertex' | 'edge' | 'face';

const pk = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);

/** edge-pair-key → edge id, for the current live mesh. */
function edgeIndex(mesh: HalfEdgeMesh): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of mesh.liveEdges()) {
    const [a, b] = mesh.edgeVertices(e);
    m.set(pk(a, b), e);
  }
  return m;
}

/** Edges incident to each vertex. */
function vertexEdges(mesh: HalfEdgeMesh): Map<number, number[]> {
  const m = new Map<number, number[]>();
  for (const e of mesh.liveEdges()) {
    const [a, b] = mesh.edgeVertices(e);
    (m.get(a) ?? m.set(a, []).get(a)!).push(e);
    (m.get(b) ?? m.set(b, []).get(b)!).push(e);
  }
  return m;
}

/** Grow a selection by one ring of adjacency (vertices/edges/faces share a vertex/edge). */
export function growSelection(mesh: HalfEdgeMesh, comp: Comp, selection: number[]): number[] {
  const sel = new Set(selection);
  if (comp === 'vertex') {
    const out = new Set(sel);
    for (const e of mesh.liveEdges()) {
      const [a, b] = mesh.edgeVertices(e);
      if (sel.has(a)) out.add(b);
      if (sel.has(b)) out.add(a);
    }
    return [...out];
  }
  if (comp === 'face') {
    const out = new Set(sel);
    const vToFaces = new Map<number, number[]>();
    for (const f of mesh.liveFaces()) for (const v of mesh.faceVertices(f)) (vToFaces.get(v) ?? vToFaces.set(v, []).get(v)!).push(f);
    for (const f of selection) for (const v of mesh.faceVertices(f)) for (const nf of vToFaces.get(v) ?? []) out.add(nf);
    return [...out];
  }
  // edge: add edges sharing a vertex with a selected edge.
  const ve = vertexEdges(mesh);
  const out = new Set(sel);
  for (const e of selection) {
    const [a, b] = mesh.edgeVertices(e);
    for (const ne of [...(ve.get(a) ?? []), ...(ve.get(b) ?? [])]) out.add(ne);
  }
  return [...out];
}

/** Shrink a selection by removing components on its boundary (adjacent to unselected). */
export function shrinkSelection(mesh: HalfEdgeMesh, comp: Comp, selection: number[]): number[] {
  const sel = new Set(selection);
  if (comp === 'vertex') {
    const keep = new Set(sel);
    for (const e of mesh.liveEdges()) {
      const [a, b] = mesh.edgeVertices(e);
      if (sel.has(a) && !sel.has(b)) keep.delete(a);
      if (sel.has(b) && !sel.has(a)) keep.delete(b);
    }
    return [...keep];
  }
  if (comp === 'face') {
    const keep = new Set(sel);
    for (const e of mesh.liveEdges()) {
      const fs = mesh.edgeFaces(e);
      if (fs.length === 2) {
        const [f1, f2] = fs;
        if (sel.has(f1) !== sel.has(f2)) {
          if (sel.has(f1)) keep.delete(f1);
          else keep.delete(f2);
        }
      } else if (fs.length === 1 && sel.has(fs[0])) {
        keep.delete(fs[0]); // border face → on the boundary
      }
    }
    return [...keep];
  }
  // edge: drop edges that touch an unselected edge at either endpoint.
  const ve = vertexEdges(mesh);
  const keep = new Set(sel);
  for (const e of selection) {
    const [a, b] = mesh.edgeVertices(e);
    const nbrs = [...(ve.get(a) ?? []), ...(ve.get(b) ?? [])].filter((x) => x !== e);
    if (nbrs.some((x) => !sel.has(x))) keep.delete(e);
  }
  return [...keep];
}

/** Convert a selection to another component type (incidence-based, like Maya's defaults). */
export function convertSelection(mesh: HalfEdgeMesh, from: Comp, selection: number[], to: Comp): number[] {
  // First gather the vertex set the selection touches.
  const verts = new Set<number>();
  if (from === 'vertex') for (const v of selection) verts.add(v);
  else if (from === 'edge') for (const e of selection) { const [a, b] = mesh.edgeVertices(e); verts.add(a); verts.add(b); }
  else for (const f of selection) for (const v of mesh.faceVertices(f)) verts.add(v);

  if (to === 'vertex') return [...verts];
  if (to === 'edge') {
    const out: number[] = [];
    for (const e of mesh.liveEdges()) {
      const [a, b] = mesh.edgeVertices(e);
      if (verts.has(a) && verts.has(b)) out.push(e); // edges fully inside the vertex set
    }
    return out;
  }
  // to face: faces all of whose verts are in the set (interior conversion).
  const out: number[] = [];
  for (const f of mesh.liveFaces()) {
    if (mesh.faceVertices(f).every((v) => verts.has(v))) out.push(f);
  }
  return out;
}

/** Edge ring: step across quads from the seed edge to its opposite edge, both directions. */
export function edgeRing(mesh: HalfEdgeMesh, seedEdge: number): number[] {
  const index = edgeIndex(mesh);
  const ring = new Set<number>([seedEdge]);
  for (const startFace of mesh.edgeFaces(seedEdge)) {
    let cur = seedEdge;
    let face: number | undefined = startFace;
    const seen = new Set<number>();
    while (face !== undefined && !seen.has(face)) {
      seen.add(face);
      const loop = mesh.faceVertices(face);
      if (loop.length !== 4) break;
      const opp = oppositeEdge(mesh, index, loop, cur);
      if (opp === undefined) break;
      ring.add(opp);
      cur = opp;
      face = mesh.edgeFaces(opp).find((f) => f !== face);
    }
  }
  return [...ring];
}

/** Face loop: the strip of quads the edge ring through `seedEdge` passes through (the faces
 *  crossed stepping to the opposite edge each step, both directions). */
export function faceLoop(mesh: HalfEdgeMesh, seedEdge: number): number[] {
  const index = edgeIndex(mesh);
  const faces = new Set<number>();
  for (const startFace of mesh.edgeFaces(seedEdge)) {
    let cur = seedEdge;
    let face: number | undefined = startFace;
    while (face !== undefined && !faces.has(face)) {
      faces.add(face);
      const loop = mesh.faceVertices(face);
      if (loop.length !== 4) break;
      const opp = oppositeEdge(mesh, index, loop, cur);
      if (opp === undefined) break;
      cur = opp;
      face = mesh.edgeFaces(opp).find((f) => f !== face);
    }
  }
  return [...faces];
}

/** Vertex loop: the vertices strung along the edge loop through `seedEdge`. */
export function vertexLoop(mesh: HalfEdgeMesh, seedEdge: number): number[] {
  const verts = new Set<number>();
  for (const e of edgeLoop(mesh, seedEdge)) {
    const [a, b] = mesh.edgeVertices(e);
    verts.add(a);
    verts.add(b);
  }
  return [...verts];
}

/**
 * The vertex loop passing through both anchor vertices `a` and `b`, or null if they don't
 * share one. Trying each edge incident to `a` disambiguates direction — which is why two
 * anchors are needed (a lone vertex has no inherent loop direction).
 */
export function loopThroughVertices(mesh: HalfEdgeMesh, a: number, b: number): number[] | null {
  if (a === b) return null;
  for (const e of (vertexEdges(mesh).get(a) ?? [])) {
    const loop = vertexLoop(mesh, e);
    if (loop.includes(b)) return loop;
  }
  return null;
}

/**
 * The face loop passing through both anchor faces `f1` and `f2`, or null if they don't share
 * one. Trying each edge of `f1` disambiguates the ring direction (a lone face has two).
 */
export function loopThroughFaces(mesh: HalfEdgeMesh, f1: number, f2: number): number[] | null {
  if (f1 === f2) return null;
  for (const he of mesh.faceHalfEdges(f1)) {
    const loop = faceLoop(mesh, mesh.halfEdges[he].edge);
    if (loop.includes(f2)) return loop;
  }
  return null;
}

/**
 * The loop (or fallback path) through a set of `anchors` in component `comp` — the shared
 * engine behind both the Select Loop action and double-click loop selection.
 *   edge:   the edge loop through the first anchor.
 *   vertex/face: the loop running through any anchor pair (so order/extra anchors don't
 *     matter); if none share a clean loop, the shortest path between the first two anchors so
 *     two picks always yield a result.
 * Returns [] when there's nothing to select (e.g. fewer than two vertex/face anchors).
 */
export function loopOrPath(mesh: HalfEdgeMesh, comp: Comp, anchors: number[]): number[] {
  if (comp === 'edge') return anchors[0] === undefined ? [] : edgeLoop(mesh, anchors[0]);
  if (anchors.length < 2) return [];
  const through = comp === 'vertex' ? loopThroughVertices : loopThroughFaces;
  for (let i = 0; i < anchors.length; i++) {
    for (let j = i + 1; j < anchors.length; j++) {
      const loop = through(mesh, anchors[i], anchors[j]);
      if (loop && loop.length > 2) return loop;
    }
  }
  return comp === 'vertex'
    ? pathBetweenVertices(mesh, anchors[0], anchors[1])
    : pathBetweenFaces(mesh, anchors[0], anchors[1]);
}

/** Shortest vertex path between `a` and `b` along edges (BFS), inclusive; [] if unreachable.
 *  The robust fallback when two anchors aren't on a clean edge loop. */
export function pathBetweenVertices(mesh: HalfEdgeMesh, a: number, b: number): number[] {
  if (a === b) return [a];
  const ve = vertexEdges(mesh);
  const prev = new Map<number, number>();
  const seen = new Set<number>([a]);
  const queue = [a];
  while (queue.length) {
    const v = queue.shift()!;
    if (v === b) break;
    for (const e of ve.get(v) ?? []) {
      const [x, y] = mesh.edgeVertices(e);
      const n = x === v ? y : x;
      if (!seen.has(n)) {
        seen.add(n);
        prev.set(n, v);
        queue.push(n);
      }
    }
  }
  if (!seen.has(b)) return [];
  const path = [b];
  let cur = b;
  while (cur !== a) {
    cur = prev.get(cur)!;
    path.push(cur);
  }
  return path.reverse();
}

/** Shortest face path between `f1` and `f2` across shared edges (BFS), inclusive; [] if
 *  unreachable. The robust fallback when two face anchors aren't on a clean ring. */
export function pathBetweenFaces(mesh: HalfEdgeMesh, f1: number, f2: number): number[] {
  if (f1 === f2) return [f1];
  const prev = new Map<number, number>();
  const seen = new Set<number>([f1]);
  const queue = [f1];
  while (queue.length) {
    const f = queue.shift()!;
    if (f === f2) break;
    for (const he of mesh.faceHalfEdges(f)) {
      const twin = mesh.halfEdges[he].twin;
      if (twin === -1) continue;
      const nf = mesh.halfEdges[twin].face;
      if (nf === -1 || seen.has(nf)) continue;
      seen.add(nf);
      prev.set(nf, f);
      queue.push(nf);
    }
  }
  if (!seen.has(f2)) return [];
  const path = [f2];
  let cur = f2;
  while (cur !== f1) {
    cur = prev.get(cur)!;
    path.push(cur);
  }
  return path.reverse();
}

/** Edge loop: extend through valence-4 vertices, picking the non-adjacent continuation. */
export function edgeLoop(mesh: HalfEdgeMesh, seedEdge: number): number[] {
  const index = edgeIndex(mesh);
  const ve = vertexEdges(mesh);
  const loop = new Set<number>([seedEdge]);
  const [va, vb] = mesh.edgeVertices(seedEdge);
  for (const start of [va, vb]) {
    let cur = seedEdge;
    let vert = start;
    const seen = new Set<number>([seedEdge]);
    for (;;) {
      const next = loopContinuation(mesh, ve, cur, vert);
      if (next === undefined || seen.has(next)) break;
      loop.add(next);
      seen.add(next);
      const [na, nb] = mesh.edgeVertices(next);
      vert = na === vert ? nb : na;
      cur = next;
    }
  }
  void index;
  return [...loop];
}

// --- internal helpers -------------------------------------------------------

/** The edge of a quad loop opposite to `edge` (shares no vertex with it). */
function oppositeEdge(mesh: HalfEdgeMesh, index: Map<string, number>, loop: number[], edge: number): number | undefined {
  const [a, b] = mesh.edgeVertices(edge);
  let i = -1;
  for (let k = 0; k < 4; k++) {
    const u = loop[k];
    const v = loop[(k + 1) % 4];
    if ((u === a && v === b) || (u === b && v === a)) {
      i = k;
      break;
    }
  }
  if (i < 0) return undefined;
  const o1 = loop[(i + 2) % 4];
  const o2 = loop[(i + 3) % 4];
  return index.get(pk(o1, o2));
}

/** The loop continuation edge at `vert`: the edge there not sharing a face with `edge`
 *  (only well-defined at a valence-4 vertex). */
function loopContinuation(mesh: HalfEdgeMesh, ve: Map<number, number[]>, edge: number, vert: number): number | undefined {
  const around = ve.get(vert) ?? [];
  if (around.length !== 4) return undefined; // irregular vertex stops the loop
  const faces = new Set(mesh.edgeFaces(edge));
  const candidates = around.filter((e) => e !== edge && !mesh.edgeFaces(e).some((f) => faces.has(f)));
  return candidates.length === 1 ? candidates[0] : undefined;
}
