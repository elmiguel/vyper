import { HalfEdgeMesh, type V3 } from '../HalfEdgeMesh';
import { snapshotSoup, pairKey, sliceLoop, type Soup } from './soup';

/** One face the loop crosses: its vertex loop plus the directed entry/exit edges the cut
 *  rides. A cut point sits at `lerp(from, to, t)` along each directed edge, so a single
 *  slide parameter `t` positions the whole ring consistently. */
interface Step {
  face: number;
  loop: number[];
  /** Directed entry edge [from, to]; cut point = lerp(from, to, t). */
  entry: [number, number];
  /** Directed exit edge [from, to]; cut point = lerp(from, to, t). */
  exit: [number, number];
}

/**
 * Loop cut: insert a ring of edge points across a strip of faces, starting from a seed edge
 * and stepping to the topologically-opposite edge of each face until the loop closes or hits
 * a boundary/incompatible face. Handles both **quad strips** (step across the opposite edge)
 * and **triangle fans** (cone/pole caps — step around the shared apex), which is what lets a
 * cone be cut. `t` (0..1) slides the ring along the strip; 0.5 is the midpoint. Takes a
 * kernel edge id; rebuilds the mesh. No-op (returns false) if the seed isn't on a strip.
 */
export function loopCut(mesh: HalfEdgeMesh, seedEdgeId: number, t = 0.5): boolean {
  const soup = snapshotSoup(mesh);
  const seed = seedDense(mesh, soup, seedEdgeId);
  if (!seed) return false;
  const steps = walkStrip(soup.polygons, seed);
  if (steps.length === 0) return false;

  const { verts, polygons } = soup;
  const cutCache = new Map<string, number>();
  // One inserted vertex per undirected edge, shared by both adjacent faces (no T-junctions).
  // The first face to touch an edge fixes the point; its neighbour reuses the same vertex.
  const cutPoint = (from: number, to: number): number => {
    const key = pairKey(from, to);
    const hit = cutCache.get(key);
    if (hit !== undefined) return hit;
    const a = verts[from];
    const b = verts[to];
    const id = verts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]) - 1;
    cutCache.set(key, id);
    return id;
  };

  for (const step of steps) {
    const pE = cutPoint(step.entry[0], step.entry[1]);
    const pX = cutPoint(step.exit[0], step.exit[1]);
    const [f1, f2] = splitFaceByChord(step.loop, step.entry, step.exit, pE, pX);
    polygons[step.face] = f1;
    polygons.push(f2);
  }
  mesh.buildFromPolygons(verts, polygons);
  return true;
}

/**
 * Preview the cut a loop through `seedEdgeId` would make at slide `t`, without mutating: one
 * [start,end] segment (model space) per face the loop crosses, for the hover/drag guide.
 */
export function loopCutPreview(mesh: HalfEdgeMesh, seedEdgeId: number, t = 0.5): Array<[V3, V3]> {
  const soup = snapshotSoup(mesh);
  const seed = seedDense(mesh, soup, seedEdgeId);
  if (!seed) return [];
  const { verts } = soup;
  const at = (from: number, to: number): V3 => {
    const a = verts[from];
    const b = verts[to];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  };
  return walkStrip(soup.polygons, seed).map((s) => [at(s.entry[0], s.entry[1]), at(s.exit[0], s.exit[1])] as [V3, V3]);
}

// --- internal helpers -------------------------------------------------------

/** The seed edge as a dense vertex pair, or null if it's not in the soup. */
function seedDense(mesh: HalfEdgeMesh, soup: Soup, seedEdgeId: number): [number, number] | null {
  if (!mesh.edges[seedEdgeId] || mesh.edges[seedEdgeId].removed) return null;
  const [ka, kb] = mesh.edgeVertices(seedEdgeId);
  const a = soup.remap.get(ka);
  const b = soup.remap.get(kb);
  return a === undefined || b === undefined ? null : [a, b];
}

/** Face indices per undirected dense edge. */
function edgeFaceMap(polygons: number[][]): Map<string, number[]> {
  const m = new Map<string, number[]>();
  polygons.forEach((loop, f) => {
    for (let i = 0; i < loop.length; i++) {
      const k = pairKey(loop[i], loop[(i + 1) % loop.length]);
      const arr = m.get(k);
      if (arr) arr.push(f);
      else m.set(k, [f]);
    }
  });
  return m;
}

/** Rotate a quad's loop so its (v0,v1) edge is the undirected `edge`, returning [v0,v1,v2,v3]
 *  in the loop's own winding (so v2,v3 is the genuine opposite edge). Null if the face isn't a
 *  quad or doesn't contain the edge. Keeps the cut parallel instead of diagonal. */
function orientQuad(loop: number[], edge: [number, number]): [number, number, number, number] | null {
  if (loop.length !== 4) return null;
  for (let k = 0; k < 4; k++) {
    const a = loop[k];
    const b = loop[(k + 1) % 4];
    if ((a === edge[0] && b === edge[1]) || (a === edge[1] && b === edge[0])) {
      return [loop[k], loop[(k + 1) % 4], loop[(k + 2) % 4], loop[(k + 3) % 4]];
    }
  }
  return null;
}

/** Cross a quad: enter the undirected `edge`, exit the opposite edge. Directed so the entry
 *  point lerp(v0,v1,t) and exit point lerp(v3,v2,t) stay parallel to the quad's sides. */
function stepQuad(loop: number[], edge: [number, number]): { entry: [number, number]; exit: [number, number] } | null {
  const o = orientQuad(loop, edge);
  if (!o) return null;
  const [a, b, c, d] = o;
  return { entry: [a, b], exit: [d, c] };
}

/** Cross a triangle of a fan: enter the spoke (apex, x), exit the other spoke (apex, y),
 *  pivoting on the shared `apex`. Both points are lerp(apex, ·, t), so the ring stays planar.
 *  Null if the face isn't a triangle, doesn't contain the apex, or the entry isn't a spoke. */
function stepFan(loop: number[], edge: [number, number], apex: number): { entry: [number, number]; exit: [number, number] } | null {
  if (loop.length !== 3 || !loop.includes(apex)) return null;
  const others = loop.filter((v) => v !== apex);
  if (others.length !== 2) return null; // apex appeared twice — degenerate
  const entryOther = edge[0] === apex ? edge[1] : edge[1] === apex ? edge[0] : null;
  if (entryOther === null || (entryOther !== others[0] && entryOther !== others[1])) return null;
  const exitOther = others[0] === entryOther ? others[1] : others[0];
  return { entry: [apex, entryOther], exit: [apex, exitOther] };
}

/**
 * Walk the strip both directions from the seed edge, trying a quad walk and a triangle-fan
 * walk pivoting on each seed endpoint; keep whichever visits the most faces. The apex of a
 * fan yields the long ring, while pivoting on a rim vertex dead-ends after one face — so the
 * "longest walk" rule picks the apex automatically.
 */
function walkStrip(polygons: number[][], seed: [number, number]): Step[] {
  const edgeFaces = edgeFaceMap(polygons);
  const candidates = [
    walkWith(polygons, edgeFaces, seed, null),
    walkWith(polygons, edgeFaces, seed, seed[0]),
    walkWith(polygons, edgeFaces, seed, seed[1]),
  ];
  return candidates.reduce((best, c) => (c.length > best.length ? c : best), [] as Step[]);
}

/** One walk in a fixed mode: `apex === null` steps across quads; otherwise steps around the
 *  given fan apex. Shares a `visited` set across both seed directions so a closed loop isn't
 *  walked twice. */
function walkWith(polygons: number[][], edgeFaces: Map<string, number[]>, seed: [number, number], apex: number | null): Step[] {
  const steps: Step[] = [];
  const visited = new Set<number>();
  for (const startFace of edgeFaces.get(pairKey(seed[0], seed[1])) ?? []) {
    let curFace: number | undefined = startFace;
    let curEdge: [number, number] = seed;
    while (curFace !== undefined && !visited.has(curFace)) {
      const loop = polygons[curFace];
      const s = apex === null ? stepQuad(loop, curEdge) : stepFan(loop, curEdge, apex);
      if (!s) break;
      visited.add(curFace);
      steps.push({ face: curFace, loop, entry: s.entry, exit: s.exit });
      curEdge = s.exit;
      curFace = edgeFaces.get(pairKey(curEdge[0], curEdge[1]))?.find((f) => f !== curFace);
    }
  }
  return steps;
}

/** Index `i` of the undirected `edge` in `loop` (between loop[i] and loop[i+1]), or -1. */
function edgeIndexInLoop(loop: number[], edge: [number, number]): number {
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    if ((a === edge[0] && b === edge[1]) || (a === edge[1] && b === edge[0])) return i;
  }
  return -1;
}

/** Split a convex face loop along the chord pEntry→pExit (points inserted on the entry/exit
 *  edges), returning the two new face loops. A quad → two quads; a fan triangle → a triangle
 *  (apex side) plus a quad (rim side). */
function splitFaceByChord(
  loop: number[],
  entry: [number, number],
  exit: [number, number],
  pEntry: number,
  pExit: number,
): [number[], number[]] {
  const n = loop.length;
  const i = edgeIndexInLoop(loop, entry);
  const j = edgeIndexInLoop(loop, exit);
  const f1 = [pEntry, ...sliceLoop(loop, (i + 1) % n, j), pExit];
  const f2 = [pExit, ...sliceLoop(loop, (j + 1) % n, i), pEntry];
  return [f1, f2];
}
