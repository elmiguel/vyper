import { EditableMesh, edgeKey, type EditVertex } from './EditableMesh';
import type { OpResult } from './meshOps';

/** A loop-cut vertex plus the original edge it rides on, so a UI can slide it. */
export interface LoopSlide {
  /** The inserted vertex index. */
  vert: number;
  /** Endpoints of the original edge the vertex sits on (for lerp positioning). */
  a: number;
  b: number;
}

/** {@link loopCut} result: the standard faces/vertices plus per-vertex slide rails. */
export interface LoopCutResult extends OpResult {
  slides: LoopSlide[];
}

/**
 * Loop cut: insert a ring of edge midpoints across a strip of quads, starting from a
 * seed edge and walking to the topologically-opposite edge of each quad until the loop
 * closes or hits a non-quad/boundary. Only quad faces are cut (true to how loop cuts
 * behave in DCC tools). Returns the inserted midpoint vertices + slide rails.
 */
export function loopCut(mesh: EditableMesh, seedEdgeKey: string): LoopCutResult {
  const edges = mesh.computeEdges();
  const seed = edges.get(seedEdgeKey);
  if (!seed) return { faces: [], vertices: [], slides: [] };

  // Collect the chain of quads + the edge crossed in each, walking both directions.
  const chain = walkQuadStrip(mesh, edges, seed);
  if (chain.length === 0) return { faces: [], vertices: [], slides: [] };

  const midCache = new Map<string, number>();
  const newVerts: number[] = [];
  const newFaces: number[] = [];
  const slides: LoopSlide[] = [];
  // Insert at the edge midpoint (so the cut vertex is shared between adjacent quads
  // regardless of winding); the caller can slide it along [a,b] afterwards.
  const midpoint = (a: number, b: number): number => {
    const key = edgeKey(a, b);
    const hit = midCache.get(key);
    if (hit !== undefined) return hit;
    const va = mesh.vertices[a];
    const vb = mesh.vertices[b];
    const id = mesh.addVertex((va.x + vb.x) / 2, (va.y + vb.y) / 2, (va.z + vb.z) / 2);
    midCache.set(key, id);
    newVerts.push(id);
    slides.push({ vert: id, a, b });
    return id;
  };

  for (const { faceId, e1, e2 } of chain) {
    const loop = mesh.faces[faceId];
    if (loop.length !== 4) continue;
    const m1 = midpoint(e1[0], e1[1]);
    const m2 = midpoint(e2[0], e2[1]);
    // Split the quad into two quads along m1..m2, preserving winding order.
    const half = splitQuad(loop, e1, e2, m1, m2);
    if (!half) continue;
    mesh.faces[faceId] = half[0];
    newFaces.push(faceId, mesh.addFace(half[1]));
  }
  return { faces: newFaces, vertices: newVerts, slides };
}

/**
 * Preview the cut a loop through `seedEdgeKey` would make, without mutating the mesh:
 * one [start,end] midpoint segment per quad the loop crosses (local space). Used to draw
 * the live hover guide for the interactive loop-cut tool.
 */
export function loopCutSegments(mesh: EditableMesh, seedEdgeKey: string): Array<[EditVertex, EditVertex]> {
  const edges = mesh.computeEdges();
  const seed = edges.get(seedEdgeKey);
  if (!seed) return [];
  const chain = walkQuadStrip(mesh, edges, seed);
  const mid = (a: number, b: number): EditVertex => ({
    x: (mesh.vertices[a].x + mesh.vertices[b].x) / 2,
    y: (mesh.vertices[a].y + mesh.vertices[b].y) / 2,
    z: (mesh.vertices[a].z + mesh.vertices[b].z) / 2,
  });
  return chain.map(({ e1, e2 }) => [mid(e1[0], e1[1]), mid(e2[0], e2[1])] as [EditVertex, EditVertex]);
}

// --- internal helpers -------------------------------------------------------

interface QuadCut {
  faceId: number;
  e1: [number, number];
  e2: [number, number];
}

/** The edge "opposite" to a given edge within a quad loop (index +2 wrap). */
function oppositeEdge(loop: number[], a: number, b: number): [number, number] | null {
  if (loop.length !== 4) return null;
  const i = loop.indexOf(a);
  const j = loop.indexOf(b);
  if (i < 0 || j < 0 || Math.abs(i - j) !== 1) {
    // a,b must be a real edge (adjacent, including the 3->0 wrap)
    if (!((i === 3 && j === 0) || (i === 0 && j === 3))) return null;
  }
  const o1 = loop[(i + 2) % 4];
  const o2 = loop[(j + 2) % 4];
  return [o1, o2];
}

/** Walk a strip of quads in both directions from a seed edge, collecting cut edges. */
function walkQuadStrip(
  mesh: EditableMesh,
  edges: Map<string, ReturnType<EditableMesh['computeEdges']> extends Map<string, infer T> ? T : never>,
  seed: { a: number; b: number; faces: number[] },
): QuadCut[] {
  const cuts: QuadCut[] = [];
  const visited = new Set<number>();
  for (const startFace of seed.faces) {
    let curFace: number | undefined = startFace;
    let curEdge: [number, number] = [seed.a, seed.b];
    while (curFace !== undefined && !visited.has(curFace)) {
      const loop = mesh.faces[curFace];
      if (loop.length !== 4) break;
      visited.add(curFace);
      const opp = oppositeEdge(loop, curEdge[0], curEdge[1]);
      if (!opp) break;
      cuts.push({ faceId: curFace, e1: curEdge, e2: opp });
      // Step to the face across the opposite edge.
      const next = edges.get(edgeKey(opp[0], opp[1]));
      const nextFace = next?.faces.find((f) => f !== curFace);
      curFace = nextFace;
      curEdge = [opp[0], opp[1]];
    }
  }
  return cuts;
}

/** Split a quad into two quads along the midpoints of edges e1 and e2. */
function splitQuad(
  loop: number[],
  e1: [number, number],
  e2: [number, number],
  m1: number,
  m2: number,
): [number[], number[]] | null {
  // Order the loop so it reads e1.start, e1.end, ..., e2.start, e2.end
  const i = loop.indexOf(e1[0]);
  if (i < 0) return null;
  const rot = [loop[i], loop[(i + 1) % 4], loop[(i + 2) % 4], loop[(i + 3) % 4]];
  // rot = [A, B, C, D] with edge e1 = A-B and opposite e2 = C-D.
  const [a, b, c, d] = rot;
  // Two quads: A, m1, m2, D  and  m1, B, C, m2
  return [
    [a, m1, m2, d],
    [m1, b, c, m2],
  ];
}
