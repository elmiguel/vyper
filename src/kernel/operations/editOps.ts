import { HalfEdgeMesh, type V3 } from '../HalfEdgeMesh';
import { snapshotSoup, compactSoup } from './soup';

/** Delete the given faces (kernel ids); unreferenced vertices are pruned. Rebuilds. */
export function deleteFaces(mesh: HalfEdgeMesh, faceIds: number[]): boolean {
  const drop = new Set(faceIds);
  const soup = snapshotSoup(mesh);
  const kept = soup.polygons.filter((_, i) => !drop.has(soup.liveFaces[i]));
  if (kept.length === soup.polygons.length) return false;
  const c = compactSoup(soup.verts, kept);
  mesh.buildFromPolygons(c.verts, c.polygons);
  return true;
}

/** Dissolve the given vertices (kernel ids): each is removed from every face loop it's in;
 *  faces that drop below 3 sides are deleted. Rebuilds. */
export function dissolveVertices(mesh: HalfEdgeMesh, vertexIds: number[]): boolean {
  const soup = snapshotSoup(mesh);
  const drop = new Set<number>();
  for (const v of vertexIds) {
    const d = soup.remap.get(v);
    if (d !== undefined) drop.add(d);
  }
  if (drop.size === 0) return false;
  const polygons = soup.polygons
    .map((loop) => loop.filter((vi) => !drop.has(vi)))
    .filter((loop) => loop.length >= 3);
  const c = compactSoup(soup.verts, polygons);
  mesh.buildFromPolygons(c.verts, c.polygons);
  return true;
}

/** Dissolve the given edges (kernel ids): the two faces sharing each edge are merged into
 *  one n-gon with the edge removed (Maya "Delete Edge"). Rebuilds. */
export function dissolveEdges(mesh: HalfEdgeMesh, edgeIds: number[]): boolean {
  const soup = snapshotSoup(mesh);
  // Re-key selected kernel edges as dense vertex pairs.
  const pairs: Array<[number, number]> = [];
  for (const e of edgeIds) {
    if (!mesh.edges[e] || mesh.edges[e].removed) continue;
    const [ka, kb] = mesh.edgeVertices(e);
    const a = soup.remap.get(ka);
    const b = soup.remap.get(kb);
    if (a !== undefined && b !== undefined) pairs.push([a, b]);
  }
  let polygons: Array<number[] | null> = soup.polygons.map((p) => p.slice());
  let any = false;
  for (const [a, b] of pairs) {
    const faces: number[] = [];
    polygons.forEach((loop, i) => {
      if (loop && hasEdge(loop, a, b)) faces.push(i);
    });
    if (faces.length !== 2) continue; // boundary or already merged — skip
    const merged = mergeAlongEdge(polygons[faces[0]]!, polygons[faces[1]]!, a, b);
    if (!merged) continue;
    polygons[faces[0]] = merged;
    polygons[faces[1]] = null;
    any = true;
  }
  if (!any) return false;
  const c = compactSoup(soup.verts, polygons.filter((p): p is number[] => p !== null));
  mesh.buildFromPolygons(c.verts, c.polygons);
  return true;
}

/** Split the given edges (kernel ids) at their midpoint, inserting a shared vertex into
 *  every face that uses each edge (Maya "Add Divisions"/insert vertex). Rebuilds. */
export function splitEdges(mesh: HalfEdgeMesh, edgeIds: number[]): boolean {
  const soup = snapshotSoup(mesh);
  let any = false;
  for (const e of edgeIds) {
    if (!mesh.edges[e] || mesh.edges[e].removed) continue;
    const [ka, kb] = mesh.edgeVertices(e);
    const a = soup.remap.get(ka);
    const b = soup.remap.get(kb);
    if (a === undefined || b === undefined) continue;
    const va = soup.verts[a];
    const vb = soup.verts[b];
    const id = soup.verts.push([(va[0] + vb[0]) / 2, (va[1] + vb[1]) / 2, (va[2] + vb[2]) / 2]) - 1;
    for (const loop of soup.polygons) {
      for (let i = 0; i < loop.length; i++) {
        const x = loop[i];
        const y = loop[(i + 1) % loop.length];
        if ((x === a && y === b) || (x === b && y === a)) {
          loop.splice(i + 1, 0, id);
          break;
        }
      }
    }
    any = true;
  }
  if (!any) return false;
  mesh.buildFromPolygons(soup.verts, soup.polygons);
  return true;
}

/** Create a face from an ordered list of vertices (kernel ids, ≥3). Rebuilds. */
export function addFace(mesh: HalfEdgeMesh, vertexIds: number[]): boolean {
  if (vertexIds.length < 3) return false;
  const soup = snapshotSoup(mesh);
  const loop = vertexIds.map((v) => soup.remap.get(v));
  if (loop.some((d) => d === undefined)) return false;
  soup.polygons.push(loop as number[]);
  mesh.buildFromPolygons(soup.verts, soup.polygons);
  return true;
}

/** Append a polygon from explicit positions (e.g. the draw-poly tool). Rebuilds. */
export function addPolygon(mesh: HalfEdgeMesh, positions: V3[]): boolean {
  if (positions.length < 3) return false;
  const soup = snapshotSoup(mesh);
  const base = soup.verts.length;
  for (const p of positions) soup.verts.push([p[0], p[1], p[2]]);
  soup.polygons.push(positions.map((_, i) => base + i));
  mesh.buildFromPolygons(soup.verts, soup.polygons);
  return true;
}

/** Duplicate the given faces (kernel ids) as independent geometry offset by `delta`.
 *  Returns the new faces' dense polygon indices (for re-selection), or []. */
export function duplicateFaces(mesh: HalfEdgeMesh, faceIds: number[], delta: V3 = [0, 0, 0]): number[] {
  const sel = new Set(faceIds);
  const soup = snapshotSoup(mesh);
  const newFaces: number[] = [];
  soup.liveFaces.forEach((kf, denseIdx) => {
    if (!sel.has(kf)) return;
    const src = soup.polygons[denseIdx];
    const loop = src.map((vi) => {
      const v = soup.verts[vi];
      return soup.verts.push([v[0] + delta[0], v[1] + delta[1], v[2] + delta[2]]) - 1;
    });
    newFaces.push(soup.polygons.push(loop) - 1);
  });
  if (newFaces.length === 0) return [];
  mesh.buildFromPolygons(soup.verts, soup.polygons);
  return newFaces;
}

/** Append welded face geometry (positions + local-index loops) offset by `delta` — the
 *  paste counterpart to {@link copySelection}. Returns the new dense face indices. */
export function pasteFaces(mesh: HalfEdgeMesh, positions: V3[], loops: number[][], delta: V3): number[] {
  if (loops.length === 0) return [];
  const soup = snapshotSoup(mesh);
  const base = soup.verts.length;
  for (const p of positions) soup.verts.push([p[0] + delta[0], p[1] + delta[1], p[2] + delta[2]]);
  const newFaces: number[] = [];
  for (const loop of loops) newFaces.push(soup.polygons.push(loop.map((li) => base + li)) - 1);
  mesh.buildFromPolygons(soup.verts, soup.polygons);
  return newFaces;
}

// --- internal helpers -------------------------------------------------------

/** Whether a face loop contains the undirected edge (a,b) as consecutive vertices. */
function hasEdge(loop: number[], a: number, b: number): boolean {
  for (let i = 0; i < loop.length; i++) {
    const u = loop[i];
    const v = loop[(i + 1) % loop.length];
    if ((u === a && v === b) || (u === b && v === a)) return true;
  }
  return false;
}

/** Merge two face loops that share the undirected edge (a,b) into one loop with the edge
 *  removed. Returns null if the directed edge isn't found in both with opposite winding. */
function mergeAlongEdge(A: number[], B: number[], a: number, b: number): number[] | null {
  let iA = -1;
  let x = -1;
  let y = -1;
  for (let i = 0; i < A.length; i++) {
    const u = A[i];
    const v = A[(i + 1) % A.length];
    if ((u === a && v === b) || (u === b && v === a)) {
      iA = i;
      x = u;
      y = v;
      break;
    }
  }
  if (iA < 0) return null;
  let jB = -1;
  for (let j = 0; j < B.length; j++) {
    if (B[j] === y && B[(j + 1) % B.length] === x) {
      jB = j;
      break;
    }
  }
  if (jB < 0) return null;
  const merged: number[] = [];
  for (let k = 0; k < A.length; k++) merged.push(A[(iA + 1 + k) % A.length]); // y … x
  for (let k = 1; k < B.length - 1; k++) merged.push(B[(jB + 1 + k) % B.length]); // x's side of B
  return merged;
}
