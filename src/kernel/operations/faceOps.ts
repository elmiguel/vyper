import { HalfEdgeMesh, type V3 } from '../HalfEdgeMesh';
import { snapshotSoup, denseFaceSet } from './soup';

/** Whichever faces are targeted: the given kernel ids, or all faces when the set is empty. */
function targetFaces(soup: ReturnType<typeof snapshotSoup>, faceIds: number[]): Set<number> {
  return faceIds.length ? denseFaceSet(soup, faceIds) : new Set(soup.polygons.map((_, i) => i));
}

/** Fan-triangulate the given faces (or all when none given): quads/n-gons → triangles. */
export function triangulateFaces(mesh: HalfEdgeMesh, faceIds: number[]): boolean {
  const soup = snapshotSoup(mesh);
  const target = targetFaces(soup, faceIds);
  const out: number[][] = [];
  let changed = false;
  soup.polygons.forEach((loop, i) => {
    if (!target.has(i) || loop.length <= 3) {
      out.push(loop);
      return;
    }
    for (let k = 1; k < loop.length - 1; k++) out.push([loop[0], loop[k], loop[k + 1]]);
    changed = true;
  });
  if (!changed) return false;
  mesh.buildFromPolygons(soup.verts, out);
  return true;
}

/** Merge adjacent coplanar triangle pairs in the given faces (or all) back into quads. */
export function quadrangulateFaces(mesh: HalfEdgeMesh, faceIds: number[], planarDot = 0.985): boolean {
  const soup = snapshotSoup(mesh);
  const target = targetFaces(soup, faceIds);
  const polys = soup.polygons;
  // Map undirected edge → triangle face indices that are in-target.
  const edgeTris = new Map<string, number[]>();
  polys.forEach((loop, f) => {
    if (loop.length !== 3 || !target.has(f)) return;
    for (let i = 0; i < 3; i++) {
      const a = loop[i];
      const b = loop[(i + 1) % 3];
      const k = a < b ? `${a}_${b}` : `${b}_${a}`;
      (edgeTris.get(k) ?? edgeTris.set(k, []).get(k)!).push(f);
    }
  });
  const used = new Set<number>();
  const removed = new Set<number>();
  let changed = false;
  for (const tris of edgeTris.values()) {
    if (tris.length !== 2) continue;
    const [f1, f2] = tris;
    if (used.has(f1) || used.has(f2)) continue;
    const quad = mergeTriPair(polys[f1], polys[f2]);
    if (!quad || !isCoplanar(quad, soup.verts, planarDot)) continue;
    polys[f1] = quad;
    removed.add(f2);
    used.add(f1);
    used.add(f2);
    changed = true;
  }
  if (!changed) return false;
  mesh.buildFromPolygons(soup.verts, polys.filter((_, i) => !removed.has(i)));
  return true;
}

/** Poke: add a center vertex to each face and fan it into triangles. */
export function pokeFaces(mesh: HalfEdgeMesh, faceIds: number[]): boolean {
  const soup = snapshotSoup(mesh);
  const target = targetFaces(soup, faceIds);
  const out: number[][] = [];
  let changed = false;
  soup.polygons.forEach((loop, i) => {
    if (!target.has(i)) {
      out.push(loop);
      return;
    }
    const c: V3 = [0, 0, 0];
    for (const vi of loop) {
      c[0] += soup.verts[vi][0];
      c[1] += soup.verts[vi][1];
      c[2] += soup.verts[vi][2];
    }
    const center = soup.verts.push([c[0] / loop.length, c[1] / loop.length, c[2] / loop.length]) - 1;
    for (let k = 0; k < loop.length; k++) out.push([loop[k], loop[(k + 1) % loop.length], center]);
    changed = true;
  });
  if (!changed) return false;
  mesh.buildFromPolygons(soup.verts, out);
  return true;
}

/** Reverse the winding of the given faces (or all) — flips their normals. */
export function reverseFaces(mesh: HalfEdgeMesh, faceIds: number[]): boolean {
  const soup = snapshotSoup(mesh);
  const target = targetFaces(soup, faceIds);
  let changed = false;
  soup.polygons.forEach((loop, i) => {
    if (target.has(i)) {
      loop.reverse();
      changed = true;
    }
  });
  if (!changed) return false;
  mesh.buildFromPolygons(soup.verts, soup.polygons);
  return true;
}

/** Extract (detach) the given faces into their own disconnected shell by giving them their
 *  own copies of any vertices shared with the rest of the mesh. Returns the new dense ids. */
export function extractFaces(mesh: HalfEdgeMesh, faceIds: number[]): number[] {
  const soup = snapshotSoup(mesh);
  const target = denseFaceSet(soup, faceIds);
  if (target.size === 0) return [];
  const dup = new Map<number, number>();
  const out: number[] = [];
  soup.polygons.forEach((loop, i) => {
    if (!target.has(i)) return;
    soup.polygons[i] = loop.map((vi) => {
      let d = dup.get(vi);
      if (d === undefined) {
        d = soup.verts.push([...soup.verts[vi]]) - 1;
        dup.set(vi, d);
      }
      return d;
    });
    out.push(i);
  });
  mesh.buildFromPolygons(soup.verts, soup.polygons);
  return out;
}

// --- internal helpers -------------------------------------------------------

/** Stitch two triangles sharing one edge into a 4-vertex quad loop, or null. */
function mergeTriPair(t1: number[], t2: number[]): number[] | null {
  const shared = t1.filter((v) => t2.includes(v));
  if (shared.length !== 2) return null;
  const [s0, s1] = shared;
  const apex1 = t1.find((v) => v !== s0 && v !== s1)!;
  const apex2 = t2.find((v) => v !== s0 && v !== s1)!;
  // Walk t1 in its own winding; replace the shared edge with a detour through apex2.
  const i0 = t1.indexOf(s0);
  const order = [t1[i0], t1[(i0 + 1) % 3], t1[(i0 + 2) % 3]]; // [s0?, ...]
  // Build [apex1, x, apex2, y] following t1's winding around the shared edge.
  const a = order[0];
  const b = order[1];
  const c = order[2];
  if (a === apex1) return [apex1, b, apex2, c];
  if (b === apex1) return [b, c, apex2, a];
  return [c, a, apex2, b];
}

/** Whether a quad's two triangle halves are coplanar within `planarDot`. */
function isCoplanar(quad: number[], verts: V3[], planarDot: number): boolean {
  const n1 = triNormal(verts[quad[0]], verts[quad[1]], verts[quad[2]]);
  const n2 = triNormal(verts[quad[0]], verts[quad[2]], verts[quad[3]]);
  return n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2] >= planarDot;
}

function triNormal(a: V3, b: V3, c: V3): V3 {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}
