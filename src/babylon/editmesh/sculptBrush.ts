import type { SculptBrushParams } from '@/types';
import type { EditableMesh, EditVertex } from './EditableMesh';

export type { SculptBrushParams, SculptBrushMode } from '@/types';
export { defaultSculptBrush } from '@/types';

/** Smoothstep falloff in [0,1] from a normalized distance t in [0,1] (1 at center). */
export function falloff(t: number): number {
  const x = 1 - Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

const dist2 = (a: EditVertex, b: { x: number; y: number; z: number }): number =>
  (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;

/**
 * Apply one dab of a sculpt brush, mutating the mesh's vertices, and return the set of
 * vertex indices it touched. All inputs are in object-local space. `hit` is the picked
 * surface point; `hitNormal` is the surface normal there; `grab` is the drag delta for
 * the grab brush. The caller recomputes normals (via the preview rebuild) afterward.
 *
 * Pure with respect to everything except the mesh's vertex positions, so the falloff
 * and per-mode displacement are unit-testable without a scene.
 */
export function applySculptBrush(
  mesh: EditableMesh,
  hit: { x: number; y: number; z: number },
  hitNormal: EditVertex,
  params: SculptBrushParams,
  grab?: { x: number; y: number; z: number },
): Set<number> {
  const r = Math.max(1e-4, params.radius);
  const r2 = r * r;
  const sign = params.invert ? -1 : 1;
  const touched = new Set<number>();

  // Gather vertices within the brush radius and their falloff weights.
  const affected: Array<{ i: number; w: number }> = [];
  mesh.vertices.forEach((v, i) => {
    const d2 = dist2(v, hit);
    if (d2 > r2) return;
    affected.push({ i, w: falloff(Math.sqrt(d2) / r) });
    touched.add(i);
  });
  if (affected.length === 0) return touched;

  if (params.mode === 'smooth') {
    smooth(mesh, affected, params.strength);
    return touched;
  }

  const normals = params.mode === 'inflate' ? mesh.vertexNormals() : null;
  const amp = params.strength * r * 0.5;

  for (const { i, w } of affected) {
    const v = mesh.vertices[i];
    switch (params.mode) {
      case 'draw': {
        // Push along the surface normal at the hit point (a clay-strips-like dab).
        v.x += hitNormal.x * amp * w * sign;
        v.y += hitNormal.y * amp * w * sign;
        v.z += hitNormal.z * amp * w * sign;
        break;
      }
      case 'inflate': {
        // Push along each vertex's own normal (balloons the surface out/in).
        const n = normals![i];
        v.x += n.x * amp * w * sign;
        v.y += n.y * amp * w * sign;
        v.z += n.z * amp * w * sign;
        break;
      }
      case 'flatten': {
        // Pull toward the plane through `hit` with `hitNormal`.
        const d = (v.x - hit.x) * hitNormal.x + (v.y - hit.y) * hitNormal.y + (v.z - hit.z) * hitNormal.z;
        const k = d * params.strength * w;
        v.x -= hitNormal.x * k;
        v.y -= hitNormal.y * k;
        v.z -= hitNormal.z * k;
        break;
      }
      case 'pinch': {
        // Pull toward the hit point (tightens features).
        const k = params.strength * w * 0.5 * sign;
        v.x += (hit.x - v.x) * k;
        v.y += (hit.y - v.y) * k;
        v.z += (hit.z - v.z) * k;
        break;
      }
      case 'grab': {
        if (!grab) break;
        v.x += grab.x * w;
        v.y += grab.y * w;
        v.z += grab.z * w;
        break;
      }
    }
  }
  return touched;
}

/** Laplacian smoothing: move each affected vertex toward its neighbors' average. */
function smooth(mesh: EditableMesh, affected: Array<{ i: number; w: number }>, strength: number): void {
  const adj = mesh.vertexAdjacency();
  // Snapshot positions so the smoothing pass reads pre-move values (order-independent).
  const snap = mesh.vertices.map((v) => ({ x: v.x, y: v.y, z: v.z }));
  for (const { i, w } of affected) {
    const ns = adj[i];
    if (ns.length === 0) continue;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const j of ns) {
      cx += snap[j].x;
      cy += snap[j].y;
      cz += snap[j].z;
    }
    cx /= ns.length;
    cy /= ns.length;
    cz /= ns.length;
    const k = strength * w;
    const v = mesh.vertices[i];
    v.x += (cx - v.x) * k;
    v.y += (cy - v.y) * k;
    v.z += (cz - v.z) * k;
  }
}
