import { HalfEdgeMesh, type V3 } from '../HalfEdgeMesh';
import { snapshotSoup, sliceLoop, type Soup } from './soup';

/** A knife click resolved to a dense edge (vertex pair) + parameter along it. */
export interface KnifePoint {
  /** Dense vertex indices of the edge the point sits on. */
  a: number;
  b: number;
  /** Parameter [0,1] from a→b. */
  t: number;
}

const END_EPS = 1e-4;

/**
 * Apply a knife path: each point is inserted as a vertex on its edge (split for every face
 * sharing that edge so the mesh stays welded), then consecutive inserted vertices that
 * share a face split it along the chord between them. Dense vertex indices must match the
 * mesh's current bake (no edits between picking and cutting). Rebuilds the mesh; returns
 * false when nothing was cut.
 */
export function knifeCut(mesh: HalfEdgeMesh, path: KnifePoint[]): boolean {
  if (path.length < 2) return false;
  const soup = snapshotSoup(mesh);
  const verts = path.map((p) => insertEdgePoint(soup, p.a, p.b, p.t));
  let cut = false;
  for (let i = 0; i + 1 < verts.length; i++) {
    if (verts[i] !== verts[i + 1] && connectPair(soup.polygons, verts[i], verts[i + 1])) cut = true;
  }
  if (!cut) return false;
  mesh.buildFromPolygons(soup.verts, soup.polygons);
  return true;
}

/** Insert a vertex on dense edge a→b at param t into every face using it; returns its id.
 *  Snaps to an existing endpoint when t lands on one. */
function insertEdgePoint(soup: Soup, a: number, b: number, t: number): number {
  if (t <= END_EPS) return a;
  if (t >= 1 - END_EPS) return b;
  const va = soup.verts[a];
  const vb = soup.verts[b];
  const id = soup.verts.push([va[0] + (vb[0] - va[0]) * t, va[1] + (vb[1] - va[1]) * t, va[2] + (vb[2] - va[2]) * t]) - 1;
  for (const loop of soup.polygons) {
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

/** Split the (single) face containing both u and v, non-adjacent, along the u–v chord. */
function connectPair(polygons: number[][], u: number, v: number): boolean {
  for (let fid = 0; fid < polygons.length; fid++) {
    const loop = polygons[fid];
    const iu = loop.indexOf(u);
    const iv = loop.indexOf(v);
    if (iu < 0 || iv < 0) continue;
    const gap = Math.abs(iu - iv);
    if (gap === 1 || gap === loop.length - 1) return false; // already an edge
    const f1 = sliceLoop(loop, iu, iv);
    const f2 = sliceLoop(loop, iv, iu);
    if (f1.length < 3 || f2.length < 3) return false;
    polygons[fid] = f1;
    polygons.push(f2);
    return true;
  }
  return false;
}

/** Lerp a point on a dense edge (model space) — for the knife's hover/marker preview. */
export function edgePointPosition(soup: Soup, a: number, b: number, t: number): V3 {
  const va = soup.verts[a];
  const vb = soup.verts[b];
  return [va[0] + (vb[0] - va[0]) * t, va[1] + (vb[1] - va[1]) * t, va[2] + (vb[2] - va[2]) * t];
}
