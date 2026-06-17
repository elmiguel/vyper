import type { Scene } from '@babylonjs/core/scene';
import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import type { Engine } from '@babylonjs/core/Engines/engine';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Vector3, Matrix } from '@babylonjs/core/Maths/math.vector';
import type { CustomGeometry } from '@/types';
import { nearestVertex, nearestEdge } from './modelerSceneGeom';
import type { ModelerPick, FacePick, ComponentMode } from './ModelerScene';

/** Read-only view of the scene state the picker needs (the model mesh changes on every edit). */
export interface PickerCtx {
  mesh: () => Mesh | undefined;
  geo: () => CustomGeometry | undefined;
  triToFace: () => number[];
  mode: () => ComponentMode;
}

/**
 * Turns the cursor position into modeler picks for {@link ModelerScene}: the polygon / nearest
 * vertex / nearest edge under the pointer, the surface point (for sketch retopo), and the
 * world→screen projection the screen-space pickers rely on. Extracted from ModelerScene to
 * keep it within the size budget; it owns no state beyond the injected scene context.
 */
export class ModelerPicker {
  constructor(
    private readonly scene: Scene,
    private readonly camera: ArcRotateCamera,
    private readonly engine: Engine,
    private readonly ctx: PickerCtx,
  ) {}

  /** Project a world point to screen pixels (matching `scene.pointerX/Y`). */
  project = (x: number, y: number, z: number): { x: number; y: number } => {
    const vp = this.camera.viewport.toGlobal(this.engine.getRenderWidth(), this.engine.getRenderHeight());
    const p = Vector3.Project(new Vector3(x, y, z), Matrix.Identity(), this.scene.getTransformMatrix(), vp);
    return { x: p.x, y: p.y };
  };

  /** Pick whatever the active component mode targets, or null on a miss. */
  pickComponent(): ModelerPick {
    if (this.ctx.mode() === 'vertex') {
      const v = this.pickVertex();
      return v === null ? null : { kind: 'vertex', vertex: v };
    }
    if (this.ctx.mode() === 'edge') {
      const e = this.pickEdge();
      return e === null ? null : { kind: 'edge', edge: e };
    }
    if (this.ctx.mode() === 'object') {
      const f = this.pickFace();
      return f === null ? null : { kind: 'object', face: f };
    }
    const f = this.pickFace();
    return f === null ? null : { kind: 'face', face: f };
  }

  /** Pick the polygon under the cursor (via the triangle→face map), or null. */
  pickFace(): FacePick {
    const mesh = this.ctx.mesh();
    if (!mesh) return null;
    const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (m) => m === mesh);
    if (!pick?.hit || pick.faceId < 0) return null;
    const f = this.ctx.triToFace()[pick.faceId];
    return f === undefined ? null : f;
  }

  /** The 3D surface point under the cursor on the model mesh, or null on a miss. */
  pickSurfacePoint(): [number, number, number] | null {
    const mesh = this.ctx.mesh();
    if (!mesh) return null;
    const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (m) => m === mesh);
    const p = pick?.pickedPoint;
    return pick?.hit && p ? [p.x, p.y, p.z] : null;
  }

  /** Nearest compacted vertex to the cursor (within a pixel threshold), or null. */
  pickVertex(): number | null {
    const geo = this.ctx.geo();
    return geo ? nearestVertex(geo, this.project, this.scene.pointerX, this.scene.pointerY, 14) : null;
  }

  /** Nearest compacted polygon edge to the cursor (within a pixel threshold), or null. */
  pickEdge(): [number, number] | null {
    const geo = this.ctx.geo();
    return geo ? nearestEdge(geo, this.project, this.scene.pointerX, this.scene.pointerY, 12) : null;
  }
}
