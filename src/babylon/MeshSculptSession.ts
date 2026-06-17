import type { Scene } from '@babylonjs/core/scene';
import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { PointerInfo } from '@babylonjs/core/Events/pointerEvents';
import { Vector3, Matrix } from '@babylonjs/core/Maths/math.vector';
import { Plane } from '@babylonjs/core/Maths/math.plane';
import type { SculptBrushParams } from '@/types';
import type { EditableMesh } from './editmesh/EditableMesh';
import { applySculptBrush } from './editmesh/sculptBrush';

/** Accessors the sculpt session needs from its owning MeshEditController. */
export interface SculptHost {
  scene: Scene;
  camera: ArcRotateCamera;
  canvas: HTMLCanvasElement;
  getEdit(): EditableMesh | undefined;
  getPreview(): Mesh | undefined;
  getRoot(): TransformNode | undefined;
  getBrush(): SculptBrushParams | null;
  rebuildPreview(): void;
  commit(): void;
}

/**
 * Pointer-driven free-form sculpting inside Edit Mode. While a brush is active the
 * owning controller delegates pointer events here: a left-drag raycasts the preview,
 * converts the hit + normal to mesh-local space, and applies the brush via the pure
 * `sculptBrush` core, committing on release. Extracted from MeshEditController to keep
 * that file focused.
 */
export class MeshSculptSession {
  private painting = false;
  private grabPlane?: Plane;
  private grabPrev?: Vector3;

  constructor(private readonly host: SculptHost) {}

  /** Route a pointer event; returns true (Edit Mode consumed it). */
  route(info: PointerInfo): boolean {
    const e = info.event as PointerEvent;
    if (info.type === 1 /* DOWN */ && e.button === 0) {
      this.painting = true;
      this.host.camera.detachControl();
      this.grabPlane = undefined;
      this.grabPrev = undefined;
      this.dab();
    } else if (info.type === 4 /* MOVE */) {
      if (this.painting) this.dab();
    } else if (info.type === 2 /* UP */) {
      if (this.painting) {
        this.painting = false;
        this.host.camera.attachControl(this.host.canvas, true);
        this.host.commit();
      }
    }
    return true;
  }

  /** Called when leaving Edit Mode / clearing the brush, to drop transient state. */
  reset(): void {
    if (this.painting) this.host.camera.attachControl(this.host.canvas, true);
    this.painting = false;
    this.grabPlane = undefined;
    this.grabPrev = undefined;
  }

  private dab(): void {
    const edit = this.host.getEdit();
    const preview = this.host.getPreview();
    const root = this.host.getRoot();
    const brush = this.host.getBrush();
    if (!edit || !preview || !brush || !root) return;
    const scene = this.host.scene;
    const pick = scene.pick(scene.pointerX, scene.pointerY, (m) => m === preview, false, this.host.camera);
    if (!pick?.hit || !pick.pickedPoint) return;
    const inv = root.getWorldMatrix().clone().invert();
    const hitLocal = Vector3.TransformCoordinates(pick.pickedPoint, inv);
    const worldN = pick.getNormal(true, true) ?? new Vector3(0, 1, 0);
    const localN = Vector3.TransformNormal(worldN, inv);
    localN.normalize();
    let grab: { x: number; y: number; z: number } | undefined;
    if (brush.mode === 'grab') grab = this.grabDelta(pick.pickedPoint, inv);
    applySculptBrush(edit, hitLocal, { x: localN.x, y: localN.y, z: localN.z }, brush, grab);
    this.host.rebuildPreview();
  }

  /** Local-space drag delta for the grab brush: project the cursor onto a view-aligned
   *  plane through the initial hit, and difference against the previous frame's point. */
  private grabDelta(worldHit: Vector3, invWorld: Matrix): { x: number; y: number; z: number } {
    const scene = this.host.scene;
    if (!this.grabPlane) {
      const n = this.host.camera.getForwardRay().direction.clone().normalize();
      this.grabPlane = Plane.FromPositionAndNormal(worldHit, n);
      this.grabPrev = worldHit.clone();
    }
    const ray = scene.createPickingRay(scene.pointerX, scene.pointerY, Matrix.Identity(), this.host.camera);
    const t = ray.intersectsPlane(this.grabPlane);
    if (t === null) return { x: 0, y: 0, z: 0 };
    const cur = ray.origin.add(ray.direction.scale(t));
    const dWorld = cur.subtract(this.grabPrev ?? cur);
    this.grabPrev = cur;
    const dLocal = Vector3.TransformNormal(dWorld, invWorld);
    return { x: dLocal.x, y: dLocal.y, z: dLocal.z };
  }
}
