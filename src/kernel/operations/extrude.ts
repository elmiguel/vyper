import { HalfEdgeMesh, type V3 } from '../HalfEdgeMesh';

/**
 * Region-extrude a set of faces along their averaged normal. Interior edges shared by
 * two selected faces stay welded; only boundary edges grow wall quads — so extruding the
 * contiguous top of a box pushes up one cap, not N stacks.
 *
 * Operations in this kernel currently transform the polygon representation and re-link a
 * fresh half-edge structure via {@link HalfEdgeMesh.buildFromPolygons} (always valid by
 * construction); they can be upgraded to in-place pointer surgery later. Returns the
 * ids of the extruded cap faces in the rebuilt mesh, for re-selection.
 */
export function extrudeFaces(mesh: HalfEdgeMesh, faceIds: number[], distance = 0.5): number[] {
  const selected = new Set(faceIds);
  if (selected.size === 0) return [];

  // Snapshot the polygon soup (dense vertex indices + face loops) from the live mesh.
  const remap = new Map<number, number>();
  const verts: V3[] = [];
  mesh.vertices.forEach((v, i) => {
    if (v.removed) return;
    remap.set(i, verts.length);
    verts.push([...v.position]);
  });
  const liveFaces = mesh.liveFaces();
  const polygons = liveFaces.map((f) => mesh.faceVertices(f).map((vi) => remap.get(vi)!));
  // Re-key the selection from HE face ids to dense polygon indices.
  const selDense = new Set<number>();
  liveFaces.forEach((f, i) => {
    if (selected.has(f)) selDense.add(i);
  });

  const { capFaces } = regionExtrude(verts, polygons, selDense, distance);
  mesh.buildFromPolygons(verts, polygons);
  return capFaces;
}

/** Mutates `verts`/`polygons` in place; returns the indices of the new cap faces. */
function regionExtrude(verts: V3[], polygons: number[][], selected: Set<number>, distance: number): { capFaces: number[] } {
  // One duplicate vertex per original vertex used by the region.
  const ring = new Set<number>();
  for (const f of selected) for (const vi of polygons[f]) ring.add(vi);
  const dup = new Map<number, number>();
  for (const vi of ring) dup.set(vi, verts.push([...verts[vi]]) - 1);

  // Count how many selected faces use each undirected edge; ==1 ⇒ boundary ⇒ wall.
  const edgeUse = new Map<string, number>();
  const key = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  for (const f of selected) {
    const loop = polygons[f];
    for (let i = 0; i < loop.length; i++) edgeUse.set(key(loop[i], loop[(i + 1) % loop.length]), (edgeUse.get(key(loop[i], loop[(i + 1) % loop.length])) ?? 0) + 1);
  }
  for (const f of selected) {
    const loop = polygons[f];
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i];
      const b = loop[(i + 1) % loop.length];
      if (edgeUse.get(key(a, b)) !== 1) continue; // interior edge — no wall
      polygons.push([a, b, dup.get(b)!, dup.get(a)!]);
    }
  }

  // Re-point the caps onto the duplicated vertices.
  const capFaces = [...selected];
  for (const f of selected) polygons[f] = polygons[f].map((vi) => dup.get(vi)!);

  // Offset the duplicated cap vertices along the averaged region normal.
  if (distance !== 0) {
    const n = averagedNormal(verts, [...selected].map((f) => polygons[f]));
    for (const vi of dup.values()) {
      verts[vi][0] += n[0] * distance;
      verts[vi][1] += n[1] * distance;
      verts[vi][2] += n[2] * distance;
    }
  }
  return { capFaces };
}

function averagedNormal(verts: V3[], loops: number[][]): V3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const loop of loops) {
    const n = newellNormal(verts, loop);
    x += n[0];
    y += n[1];
    z += n[2];
  }
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

function newellNormal(verts: V3[], loop: number[]): V3 {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < loop.length; i++) {
    const a = verts[loop[i]];
    const b = verts[loop[(i + 1) % loop.length]];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}
