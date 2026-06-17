import { EditableMesh, edgeKey, type EditVertex } from './EditableMesh';

// Loop cut and topology operators live in sibling files; re-exported here so callers can
// keep importing the whole operator set from `meshOps`.
export { loopCut, loopCutSegments, type LoopSlide, type LoopCutResult } from './loopCutOps';
export { connectVertices, bridgeEdgeLoops, splitEdgeLoops } from './topologyOps';

/** What an operator produced, so the controller can re-select the new geometry. */
export interface OpResult {
  /** Faces created by the op (indices into the post-op `mesh.faces`). */
  faces: number[];
  /** Vertices created by the op. */
  vertices: number[];
}

const sub = (a: EditVertex, b: EditVertex): EditVertex => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const len = (v: EditVertex): number => Math.hypot(v.x, v.y, v.z);

/**
 * Extrude a region of faces along the averaged region normal (or a caller delta).
 * Interior edges shared by two selected faces stay welded; only boundary edges grow
 * walls — so extruding the contiguous top of a box pushes up one cap, not N stacks.
 * Returns the moved cap vertices so the caller can immediately drag them on a gizmo.
 */
export function extrudeFaces(mesh: EditableMesh, faceIds: number[], distance = 0): OpResult {
  const selected = new Set(faceIds);
  if (selected.size === 0) return { faces: [], vertices: [] };

  // One duplicate per original vertex used by the region.
  const ringVerts = new Set<number>();
  for (const fid of selected) for (const vi of mesh.faces[fid]) ringVerts.add(vi);
  const dup = new Map<number, number>();
  for (const vi of ringVerts) {
    const v = mesh.vertices[vi];
    dup.set(vi, mesh.addVertex(v.x, v.y, v.z));
  }

  // Boundary edges (used by exactly one selected face) get a wall quad.
  const edgeUse = new Map<string, { a: number; b: number; count: number }>();
  for (const fid of selected) {
    const loop = mesh.faces[fid];
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i];
      const b = loop[(i + 1) % loop.length];
      const key = edgeKey(a, b);
      const rec = edgeUse.get(key) ?? { a, b, count: 0 };
      rec.count++;
      edgeUse.set(key, rec);
    }
  }
  const wallFaces: number[] = [];
  for (const fid of selected) {
    const loop = mesh.faces[fid];
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i];
      const b = loop[(i + 1) % loop.length];
      if ((edgeUse.get(edgeKey(a, b))?.count ?? 0) !== 1) continue; // interior — skip
      // Wall keeps outward winding consistent with the cap moving away.
      wallFaces.push(mesh.addFace([a, b, dup.get(b)!, dup.get(a)!]));
    }
  }

  // Re-point the caps onto the duplicated vertices.
  for (const fid of selected) {
    mesh.faces[fid] = mesh.faces[fid].map((vi) => dup.get(vi)!);
  }

  // Offset the cap along the averaged region normal by `distance`.
  if (distance !== 0) {
    const n = averagedNormal(mesh, faceIds);
    mesh.translateVertices(dup.values(), n.x * distance, n.y * distance, n.z * distance);
  }

  return { faces: [...selected, ...wallFaces], vertices: [...dup.values()] };
}

/**
 * Inset each face independently: shrink a copy of the loop toward the face centroid
 * by `ratio` (0–1), bridge the gap with rim quads, and leave the shrunken loop as the
 * face. Returns the inner faces + their new vertices.
 */
export function insetFaces(mesh: EditableMesh, faceIds: number[], ratio = 0.25): OpResult {
  const newFaces: number[] = [];
  const newVerts: number[] = [];
  const t = Math.max(0, Math.min(1, ratio));
  for (const fid of faceIds) {
    const loop = mesh.faces[fid].slice();
    if (loop.length < 3) continue;
    const c = mesh.faceCentroid(fid);
    const inner = loop.map((vi) => {
      const v = mesh.vertices[vi];
      const id = mesh.addVertex(v.x + (c.x - v.x) * t, v.y + (c.y - v.y) * t, v.z + (c.z - v.z) * t);
      newVerts.push(id);
      return id;
    });
    for (let i = 0; i < loop.length; i++) {
      const j = (i + 1) % loop.length;
      newFaces.push(mesh.addFace([loop[i], loop[j], inner[j], inner[i]]));
    }
    mesh.faces[fid] = inner; // face becomes the inset cap
  }
  return { faces: [...faceIds, ...newFaces], vertices: newVerts };
}

/**
 * Linear (midpoint) subdivision of each face. Edge midpoints are shared across
 * adjacent subdivided faces so no cracks appear; an n-gon becomes n quads around a
 * new center vertex. Works for triangles, quads, and arbitrary n-gons.
 */
export function subdivideFaces(mesh: EditableMesh, faceIds: number[]): OpResult {
  const newFaces: number[] = [];
  const newVerts: number[] = [];
  const midCache = new Map<string, number>();
  const midpoint = (a: number, b: number): number => {
    const key = edgeKey(a, b);
    const hit = midCache.get(key);
    if (hit !== undefined) return hit;
    const va = mesh.vertices[a];
    const vb = mesh.vertices[b];
    const id = mesh.addVertex((va.x + vb.x) / 2, (va.y + vb.y) / 2, (va.z + vb.z) / 2);
    midCache.set(key, id);
    newVerts.push(id);
    return id;
  };
  // Replace originals back-to-front so earlier indices stay valid while we read them.
  const sorted = [...new Set(faceIds)].sort((p, q) => q - p);
  for (const fid of sorted) {
    const loop = mesh.faces[fid].slice();
    if (loop.length < 3) continue;
    const c = mesh.faceCentroid(fid);
    const center = mesh.addVertex(c.x, c.y, c.z);
    newVerts.push(center);
    const mids = loop.map((_, i) => midpoint(loop[i], loop[(i + 1) % loop.length]));
    const quads: number[][] = [];
    for (let i = 0; i < loop.length; i++) {
      const prevMid = mids[(i - 1 + loop.length) % loop.length];
      quads.push([loop[i], mids[i], center, prevMid]);
    }
    mesh.faces[fid] = quads[0];
    newFaces.push(fid);
    for (let i = 1; i < quads.length; i++) newFaces.push(mesh.addFace(quads[i]));
  }
  return { faces: newFaces, vertices: newVerts };
}

/**
 * Bevel (chamfer) the given edges by `amount` world units. Each selected edge is
 * split into a flat strip: its endpoints are pulled back along their incident edges
 * and a new quad bridges the gap. Kept deliberately simple — single-segment bevel on
 * the two faces sharing each edge; multi-edge fans are beveled independently.
 */
export function bevelEdges(mesh: EditableMesh, edgeKeys: string[], amount = 0.1): OpResult {
  const newFaces: number[] = [];
  const newVerts: number[] = [];
  const edges = mesh.computeEdges();
  for (const key of edgeKeys) {
    const e = edges.get(key);
    if (!e || e.faces.length === 0) continue;
    const a = e.a;
    const b = e.b;
    // Pull-back directions: along each face's other edge from the shared endpoint.
    const dirA = pullDir(mesh, e.faces, a, b);
    const dirB = pullDir(mesh, e.faces, b, a);
    const va = mesh.vertices[a];
    const vb = mesh.vertices[b];
    const a2 = mesh.addVertex(va.x + dirA.x * amount, va.y + dirA.y * amount, va.z + dirA.z * amount);
    const b2 = mesh.addVertex(vb.x + dirB.x * amount, vb.y + dirB.y * amount, vb.z + dirB.z * amount);
    newVerts.push(a2, b2);
    newFaces.push(mesh.addFace([a, b, b2, a2]));
  }
  return { faces: newFaces, vertices: newVerts };
}

// --- internal helpers -------------------------------------------------------

function averagedNormal(mesh: EditableMesh, faceIds: number[]): EditVertex {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const fid of faceIds) {
    const n = mesh.faceNormal(fid);
    x += n.x;
    y += n.y;
    z += n.z;
  }
  const l = Math.hypot(x, y, z) || 1;
  return { x: x / l, y: y / l, z: z / l };
}

/** Unit direction from `from` toward its neighbor in a face other than across `away`. */
function pullDir(mesh: EditableMesh, faceIds: number[], from: number, away: number): EditVertex {
  for (const fid of faceIds) {
    const loop = mesh.faces[fid];
    const i = loop.indexOf(from);
    if (i < 0) continue;
    const prev = loop[(i - 1 + loop.length) % loop.length];
    const next = loop[(i + 1) % loop.length];
    const other = next === away ? prev : next;
    const d = sub(mesh.vertices[other], mesh.vertices[from]);
    const l = len(d) || 1;
    return { x: d.x / l, y: d.y / l, z: d.z / l };
  }
  return { x: 0, y: 0, z: 0 };
}
