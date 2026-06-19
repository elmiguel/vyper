import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Scene } from '@babylonjs/core/scene';
import { CreateLineSystem } from '@babylonjs/core/Meshes/Builders/linesBuilder';
import type { LinesMesh } from '@babylonjs/core/Meshes/linesMesh';
import type { CustomGeometry } from '@/types';

/**
 * Pure geometry helpers for kernel-backed Edit Mode: screen-space component picking and the
 * vertex/edge/face highlight + wireframe + dim overlays. They operate on a baked
 * {@link CustomGeometry} (dense `polyVerts`/`polygons`) and Babylon primitives only — no kernel,
 * no store — so both the (retiring) Modeling Studio and the scene editor's Edit Mode share one
 * implementation. Moved here from the studio's `modelerSceneGeom` so the editor doesn't depend on
 * `src/modeler`.
 */

/** Compute vertex normals for baked geometry (when none were supplied). */
export function computeNormals(geo: CustomGeometry): number[] {
  const normals: number[] = [];
  VertexData.ComputeNormals(geo.positions, geo.indices, normals);
  return normals;
}

/** Squared distance from point (px,py) to segment (ax,ay)-(bx,by), in pixels². */
export function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return (px - cx) * (px - cx) + (py - cy) * (py - cy);
}

/** A function projecting a world point to screen pixels (matching `scene.pointerX/Y`). */
export type Projector = (x: number, y: number, z: number) => { x: number; y: number };

/** Nearest compacted vertex to the cursor within `thresh` pixels, or null. */
export function nearestVertex(geo: CustomGeometry, project: Projector, px: number, py: number, thresh: number): number | null {
  const pv = geo.polyVerts;
  if (!pv) return null;
  let best = -1;
  let bestD = thresh * thresh;
  for (let vi = 0; vi < pv.length / 3; vi++) {
    const s = project(pv[vi * 3], pv[vi * 3 + 1], pv[vi * 3 + 2]);
    const d = (s.x - px) * (s.x - px) + (s.y - py) * (s.y - py);
    if (d < bestD) {
      bestD = d;
      best = vi;
    }
  }
  return best < 0 ? null : best;
}

/** Nearest compacted polygon edge to the cursor within `thresh` pixels, or null. */
export function nearestEdge(geo: CustomGeometry, project: Projector, px: number, py: number, thresh: number): [number, number] | null {
  const pv = geo.polyVerts;
  const polys = geo.polygons;
  if (!pv || !polys) return null;
  let best: [number, number] | null = null;
  let bestD = thresh * thresh;
  const seen = new Set<string>();
  for (const loop of polys) {
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i];
      const b = loop[(i + 1) % loop.length];
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const sa = project(pv[a * 3], pv[a * 3 + 1], pv[a * 3 + 2]);
      const sb = project(pv[b * 3], pv[b * 3 + 1], pv[b * 3 + 2]);
      const d = distToSegment(px, py, sa.x, sa.y, sb.x, sb.y);
      if (d < bestD) {
        bestD = d;
        best = [a, b];
      }
    }
  }
  return best;
}

/** Nearest compacted edge to the cursor plus the parameter t along it (for the knife),
 *  within `thresh` pixels, or null. */
export function nearestEdgeWithT(
  geo: CustomGeometry,
  project: Projector,
  px: number,
  py: number,
  thresh: number,
): { edge: [number, number]; t: number } | null {
  const pv = geo.polyVerts;
  const polys = geo.polygons;
  if (!pv || !polys) return null;
  let best: { edge: [number, number]; t: number } | null = null;
  let bestD = thresh * thresh;
  const seen = new Set<string>();
  for (const loop of polys) {
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i];
      const b = loop[(i + 1) % loop.length];
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const sa = project(pv[a * 3], pv[a * 3 + 1], pv[a * 3 + 2]);
      const sb = project(pv[b * 3], pv[b * 3 + 1], pv[b * 3 + 2]);
      const dx = sb.x - sa.x;
      const dy = sb.y - sa.y;
      const len2 = dx * dx + dy * dy;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - sa.x) * dx + (py - sa.y) * dy) / len2));
      const cx = sa.x + t * dx;
      const cy = sa.y + t * dy;
      const d = (px - cx) * (px - cx) + (py - cy) * (py - cy);
      if (d < bestD) {
        bestD = d;
        // Orient t so it measures from the lower-index endpoint (matches edge key order).
        best = a < b ? { edge: [a, b], t } : { edge: [b, a], t: 1 - t };
      }
    }
  }
  return best;
}

/** Build a translucent overlay mesh covering the given polygon (face) indices, or undefined. */
export function buildFaceHighlight(scene: Scene, geo: CustomGeometry, faces: number[], mat: StandardMaterial): Mesh | undefined {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const f of faces) {
    const loop = geo.polygons![f];
    if (!loop) continue;
    const base = positions.length / 3;
    for (const vi of loop) positions.push(geo.polyVerts![vi * 3], geo.polyVerts![vi * 3 + 1], geo.polyVerts![vi * 3 + 2]);
    for (let i = 1; i < loop.length - 1; i++) indices.push(base, base + i, base + i + 1);
  }
  if (indices.length === 0) return undefined;
  const hi = new Mesh('faceHi', scene);
  const vd = new VertexData();
  vd.positions = positions;
  vd.indices = indices;
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  vd.normals = normals;
  vd.applyToMesh(hi);
  hi.material = mat;
  hi.isPickable = false;
  hi.renderingGroupId = 1;
  return hi;
}

/** Build a points-cloud overlay at the given compacted vertex indices, or undefined. */
export function buildVertexHighlight(scene: Scene, geo: CustomGeometry, verts: number[], mat: StandardMaterial): Mesh | undefined {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const vi of verts) {
    if (geo.polyVerts![vi * 3] === undefined) continue;
    indices.push(positions.length / 3);
    positions.push(geo.polyVerts![vi * 3], geo.polyVerts![vi * 3 + 1], geo.polyVerts![vi * 3 + 2]);
  }
  if (positions.length === 0) return undefined;
  const hi = new Mesh('vertHi', scene);
  const vd = new VertexData();
  vd.positions = positions;
  vd.indices = indices; // point list (rendered as a points cloud by its material)
  vd.applyToMesh(hi);
  hi.material = mat;
  hi.isPickable = false;
  hi.renderingGroupId = 1;
  return hi;
}

/** Build a bright line overlay along the given compacted edge endpoint pairs, or undefined. */
export function buildEdgeHighlight(
  scene: Scene,
  geo: CustomGeometry,
  edges: Array<[number, number]>,
  color = new Color3(1, 0.8, 0.27),
): LinesMesh | undefined {
  const point = (vi: number) => new Vector3(geo.polyVerts![vi * 3], geo.polyVerts![vi * 3 + 1], geo.polyVerts![vi * 3 + 2]);
  const lines = edges
    .filter(([a, b]) => geo.polyVerts![a * 3] !== undefined && geo.polyVerts![b * 3] !== undefined)
    .map(([a, b]) => [point(a), point(b)]);
  if (lines.length === 0) return undefined;
  const hi = CreateLineSystem('edgeHi', { lines }, scene);
  hi.color = color;
  hi.isPickable = false;
  hi.renderingGroupId = 1;
  return hi;
}

/**
 * Per-vertex RGBA colors that dim every triangle whose polygon isn't in `activePolys` — the
 * visual for "other objects dimmed while one is focused". `activePolys` holds dense polygon
 * indices; null means nothing is focused, so everything stays bright. Vertex colors multiply
 * the material diffuse, so dim verts render darker. (Islands don't share vertices, so a
 * vertex is unambiguously active or not.)
 */
export function buildIslandColors(geo: CustomGeometry, triToFace: number[], activePolys: Set<number> | null): Float32Array {
  const colors = new Float32Array((geo.positions.length / 3) * 4).fill(1);
  if (!activePolys) return colors; // all bright
  const DIM = 0.5; // subtle: noticeably darker but still readable for context
  for (let i = 0; i < colors.length; i += 4) {
    colors[i] = DIM;
    colors[i + 1] = DIM;
    colors[i + 2] = DIM;
  }
  for (let t = 0; t < triToFace.length; t++) {
    if (!activePolys.has(triToFace[t])) continue;
    for (let k = 0; k < 3; k++) {
      const vi = geo.indices[t * 3 + k] * 4;
      colors[vi] = 1;
      colors[vi + 1] = 1;
      colors[vi + 2] = 1;
    }
  }
  return colors;
}

/**
 * Draw every real polygon edge as a line system. Built from the kernel's `polygons`/`polyVerts`
 * (deduped face-boundary edges) rather than Babylon's angle-based `enableEdgesRendering` —
 * that heuristic misses edges on a flat-shaded, triangulated mesh. Returns undefined when the
 * geometry carries no polygon topology.
 */
export function buildWireframe(scene: Scene, geo: CustomGeometry): LinesMesh | undefined {
  const { polygons, polyVerts } = geo;
  if (!polygons || !polyVerts) return undefined;
  const seen = new Set<string>();
  const lines: Vector3[][] = [];
  const point = (vi: number) => new Vector3(polyVerts[vi * 3], polyVerts[vi * 3 + 1], polyVerts[vi * 3 + 2]);
  for (const loop of polygons) {
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i];
      const b = loop[(i + 1) % loop.length];
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push([point(a), point(b)]);
    }
  }
  if (lines.length === 0) return undefined;
  const wire = CreateLineSystem('wire', { lines }, scene);
  wire.color = new Color3(0.2, 0.85, 1);
  wire.isPickable = false;
  wire.renderingGroupId = 1; // draw over the shaded surface
  return wire;
}

/** Dense polygon index per render triangle, from baked polygon loops (fan-triangulation order,
 *  matching `toGeometry`). Lets a face raycast on the preview map back to its polygon. */
export function triToFaceMap(geo: CustomGeometry): number[] {
  const map: number[] = [];
  const polys = geo.polygons;
  if (!polys) return map;
  polys.forEach((loop, f) => {
    for (let i = 1; i < loop.length - 1; i++) map.push(f);
  });
  return map;
}
