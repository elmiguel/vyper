import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { CreateLineSystem } from '@babylonjs/core/Meshes/Builders/linesBuilder';
import type { LinesMesh } from '@babylonjs/core/Meshes/linesMesh';
import type { Scene } from '@babylonjs/core/scene';

// The kernel-edit geometry helpers now live in babylon/editmesh (shared with the scene editor's
// Edit Mode); re-exported here so the Studio keeps importing them from this path until it's
// retired. Box/tri-planar UVs live in babylon/meshUVs.
export {
  computeNormals,
  distToSegment,
  nearestVertex,
  nearestEdge,
  nearestEdgeWithT,
  buildFaceHighlight,
  buildVertexHighlight,
  buildEdgeHighlight,
  buildIslandColors,
  buildWireframe,
  type Projector,
} from '@/babylon/editmesh/kernelGeom';
export { computeBoxUVs } from '@/babylon/meshUVs';

/** Build the modeler's ground reference grid (a faint line system on the y=0 plane). */
export function buildGroundGrid(scene: Scene): LinesMesh {
  const HALF = 10;
  const STEP = 1;
  const lines: Vector3[][] = [];
  for (let i = -HALF; i <= HALF; i += STEP) {
    lines.push([new Vector3(i, 0, -HALF), new Vector3(i, 0, HALF)]);
    lines.push([new Vector3(-HALF, 0, i), new Vector3(HALF, 0, i)]);
  }
  const grid = CreateLineSystem('grid', { lines }, scene);
  grid.color = new Color3(0.22, 0.22, 0.34);
  grid.isPickable = false;
  grid.position.y = -0.001;
  return grid;
}
