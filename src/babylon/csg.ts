import type { Scene } from '@babylonjs/core/scene';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CSG2, InitializeCSG2Async, IsCSG2Ready } from '@babylonjs/core/Meshes/csg2';
import type { BooleanOp, CustomGeometry } from '@/types';
import { toCustomGeometry } from './customMesh';

let initPromise: Promise<void> | null = null;

/**
 * Ensure the Manifold WASM backing CSG2 is loaded. `InitializeCSG2Async` fetches
 * manifold-3d from a CDN by default (works online; the editor is online in dev).
 * Cached so we only initialize once. Offline/desktop hosting is a follow-up.
 */
export function ensureCsgReady(): Promise<void> {
  if (IsCSG2Ready()) return Promise.resolve();
  if (!initPromise) initPromise = InitializeCSG2Async();
  return initPromise;
}

/**
 * Combine two meshes with a boolean operation and return baked, world-space
 * geometry for a new custom mesh. Returns null if CSG isn't available. The caller
 * owns disposing the temporary result mesh-free `CustomGeometry` (no live mesh).
 */
export async function bakeBoolean(scene: Scene, a: Mesh, b: Mesh, op: BooleanOp): Promise<CustomGeometry | null> {
  await ensureCsgReady();
  const csgA = CSG2.FromMesh(a);
  const csgB = CSG2.FromMesh(b);
  const result = op === 'union' ? csgA.add(csgB) : op === 'subtract' ? csgA.subtract(csgB) : csgA.intersect(csgB);
  const temp = result.toMesh(`__csg_${a.name}`, scene);
  const geo = toCustomGeometry(temp);
  // Free the CSG handles + the temporary mesh; only the baked arrays survive.
  temp.dispose();
  csgA.dispose();
  csgB.dispose();
  result.dispose();
  return geo;
}
