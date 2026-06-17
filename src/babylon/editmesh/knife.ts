import { EditableMesh, type EditVertex } from './EditableMesh';
import { connectVertices, type OpResult } from './meshOps';

/** An edge of a face plus the closest point on it to a probe, used by the knife to snap
 *  a click onto the nearest edge. */
export interface EdgeHit {
  /** Endpoints of the edge (vertex indices). */
  a: number;
  b: number;
  /** Parameter [0,1] of the closest point along a→b. */
  t: number;
  /** The closest point in the mesh's local space. */
  point: EditVertex;
  /** Distance from the probe to that point. */
  dist: number;
}

/** Clamped parameter of the closest point on segment a→b to point p. */
function segParam(p: EditVertex, a: EditVertex, b: EditVertex): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const denom = abx * abx + aby * aby + abz * abz || 1;
  const t = ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / denom;
  return Math.max(0, Math.min(1, t));
}

/** The edge of `faceId` whose closest point is nearest to local-space point `p`. */
export function nearestFaceEdge(mesh: EditableMesh, faceId: number, p: EditVertex): EdgeHit | null {
  const loop = mesh.faces[faceId];
  if (!loop || loop.length < 2) return null;
  let best: EdgeHit | null = null;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    const va = mesh.vertices[a];
    const vb = mesh.vertices[b];
    const t = segParam(p, va, vb);
    const point = { x: va.x + (vb.x - va.x) * t, y: va.y + (vb.y - va.y) * t, z: va.z + (vb.z - va.z) * t };
    const dist = Math.hypot(p.x - point.x, p.y - point.y, p.z - point.z);
    if (!best || dist < best.dist) best = { a, b, t, point, dist };
  }
  return best;
}

/** A knife click resolved to an edge + parameter (output of {@link nearestFaceEdge}). */
export interface KnifePoint {
  a: number;
  b: number;
  t: number;
}

const EDGE_END_EPS = 1e-4;

/**
 * Insert a vertex on edge a→b at parameter t in every face that uses that edge (so the
 * split stays welded across the shared edge). When t lands on an endpoint, returns that
 * existing vertex instead of creating a degenerate one.
 */
export function insertEdgePoint(mesh: EditableMesh, a: number, b: number, t: number): number {
  if (t <= EDGE_END_EPS) return a;
  if (t >= 1 - EDGE_END_EPS) return b;
  const va = mesh.vertices[a];
  const vb = mesh.vertices[b];
  const id = mesh.addVertex(va.x + (vb.x - va.x) * t, va.y + (vb.y - va.y) * t, va.z + (vb.z - va.z) * t);
  for (const loop of mesh.faces) {
    for (let i = 0; i < loop.length; i++) {
      const x = loop[i];
      const y = loop[(i + 1) % loop.length];
      if ((x === a && y === b) || (x === b && y === a)) {
        loop.splice(i + 1, 0, id);
        break; // the edge occurs at most once per face
      }
    }
  }
  return id;
}

/**
 * Apply a knife path: a sequence of points, each on an edge. Each point is inserted as a
 * vertex on its edge, then consecutive inserted vertices that share a face split it along
 * the chord between them ({@link connectVertices}). Returns the new faces + vertices.
 */
export function applyKnife(mesh: EditableMesh, path: KnifePoint[]): OpResult {
  if (path.length < 2) return { faces: [], vertices: [] };
  const verts = path.map((p) => insertEdgePoint(mesh, p.a, p.b, p.t));
  const newVerts: number[] = [];
  const newFaces: number[] = [];
  const seen = new Set<number>();
  for (const v of verts) if (!seen.has(v)) (seen.add(v), newVerts.push(v));
  for (let i = 0; i + 1 < verts.length; i++) {
    if (verts[i] === verts[i + 1]) continue;
    const res = connectVertices(mesh, [verts[i], verts[i + 1]]);
    newFaces.push(...res.faces);
  }
  return { faces: newFaces, vertices: newVerts };
}
