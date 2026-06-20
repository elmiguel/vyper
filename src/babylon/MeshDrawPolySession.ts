import type { Scene } from '@babylonjs/core/scene';
import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { PointerInfo } from '@babylonjs/core/Events/pointerEvents';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { CreateLineSystem } from '@babylonjs/core/Meshes/Builders/linesBuilder';
import type { LinesMesh } from '@babylonjs/core/Meshes/linesMesh';
import type { V3 } from '@/kernel/HalfEdgeMesh';

/** What the draw-poly session needs from the edit controller. */
export interface DrawPolyHost {
  scene: Scene;
  camera: ArcRotateCamera;
  getRoot(): TransformNode | undefined;
  /** Commit the placed outline (mesh-local points) as a new face. */
  commit(localPoints: V3[]): void;
}

const GUIDE = new Color3(0.3, 1, 0.5);

/**
 * Interactive Draw-Poly tool: left-click drops points on the ground plane (y=0 in world,
 * converted to the edited mesh's local space), right-click / Enter closes them into a new face.
 * Mirrors the studio's draw-poly; the geometry op lives in the kernel session (`drawPolyCommit`).
 */
export class MeshDrawPolySession {
  private points: V3[] = [];
  private guide?: LinesMesh;

  constructor(private readonly host: DrawPolyHost) {}

  route(info: PointerInfo): boolean {
    const e = info.event as PointerEvent;
    if (info.type === 1 /* DOWN */ && e.button === 0 && !e.altKey) {
      const p = this.groundLocal();
      if (p) {
        this.points.push(p);
        this.draw();
      }
    } else if (info.type === 1 && e.button === 2) {
      this.finish(); // right-click closes the face
    }
    return true;
  }

  /** Close the current outline into a face (≥3 points), then reset. */
  finish(): void {
    if (this.points.length >= 3) this.host.commit(this.points.map((p) => [...p] as V3));
    this.reset();
  }

  reset(): void {
    this.guide?.dispose();
    this.guide = undefined;
    this.points = [];
  }

  /** Ray→ground (world y=0) under the cursor, expressed in the edited mesh's local space. */
  private groundLocal(): V3 | null {
    const scene = this.host.scene;
    const ray = scene.createPickingRay(scene.pointerX, scene.pointerY, Matrix.Identity(), this.host.camera);
    if (Math.abs(ray.direction.y) < 1e-6) return null;
    const t = -ray.origin.y / ray.direction.y;
    if (t < 0) return null;
    const world = ray.origin.add(ray.direction.scale(t));
    const root = this.host.getRoot();
    const local = root ? Vector3.TransformCoordinates(world, root.getWorldMatrix().clone().invert()) : world;
    return [local.x, local.y, local.z];
  }

  private draw(): void {
    this.guide?.dispose();
    this.guide = undefined;
    const root = this.host.getRoot();
    if (!root || this.points.length < 1) return;
    const pts = this.points.map((p) => new Vector3(p[0], p[1], p[2]));
    if (pts.length >= 2) pts.push(pts[0]); // close the loop preview
    const m = CreateLineSystem('drawpoly-guide', { lines: [pts] }, this.host.scene);
    m.parent = root;
    m.color = GUIDE;
    m.isPickable = false;
    m.renderingGroupId = 1;
    this.guide = m;
  }
}
