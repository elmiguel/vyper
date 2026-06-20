import type { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { PositionGizmo } from '@babylonjs/core/Gizmos/positionGizmo';
import { RotationGizmo } from '@babylonjs/core/Gizmos/rotationGizmo';
import { ScaleGizmo } from '@babylonjs/core/Gizmos/scaleGizmo';
import { UtilityLayerRenderer } from '@babylonjs/core/Rendering/utilityLayerRenderer';

/** Which transform the component gizmo drives. Mirrors the editor's move/rotate/scale modes
 *  ('select' shows no gizmo). */
export type ComponentGizmoMode = 'move' | 'rotate' | 'scale';

/** Local-space pivot/centre a rotate or scale drag pivots about. */
export interface Pivot {
  x: number;
  y: number;
  z: number;
}

/**
 * Per-frame deltas the gizmo reports while dragging; the owning controller applies each to the
 * selected vertices. Translate is a local-space delta; rotate is an incremental unit quaternion
 * about `pivot`; scale is a per-axis multiplier about `pivot`. `begin`/`end` bracket a drag so the
 * controller can snapshot once for a single undo step.
 */
export interface ComponentGizmoHandlers {
  begin(): void;
  translate(dx: number, dy: number, dz: number): void;
  rotate(q: { x: number; y: number; z: number; w: number }, pivot: [number, number, number]): void;
  scale(sx: number, sy: number, sz: number, pivot: [number, number, number]): void;
  end(): void;
}

/**
 * The transform gizmo that drives Edit-Mode component (vertex/edge/face) moves. It owns a
 * {@link PositionGizmo}, {@link RotationGizmo}, and {@link ScaleGizmo} on a shared helper
 * {@link TransformNode}; only the one matching the active {@link ComponentGizmoMode} is enabled.
 * Each drag accumulates the absolute transform on the node, which is diffed per frame into an
 * incremental delta reported through {@link ComponentGizmoHandlers}. The controller applies the
 * delta to the selected kernel vertices and rebuilds the preview. Mirrors the studio's
 * modelerGizmoWiring; extracted from MeshEditController so the controller stays focused.
 */
export class MeshComponentGizmo {
  private pos?: PositionGizmo;
  private rot?: RotationGizmo;
  private scale?: ScaleGizmo;
  private node?: TransformNode;
  private mode: ComponentGizmoMode = 'move';
  private isDragging = false;
  private attached = false;
  // Scratch absolute transforms diffed per frame into incremental deltas.
  private lastPos = new Vector3();
  private lastQuat = Quaternion.Identity();
  private lastScale = Vector3.One();

  constructor(
    private readonly scene: Scene,
    private readonly getLayer: () => UtilityLayerRenderer,
    private readonly handlers: ComponentGizmoHandlers,
  ) {}

  /** True while the user is dragging the gizmo (callers suppress marquee/select). */
  get dragging(): boolean {
    return this.isDragging;
  }

  /** Switch which transform gizmo is active. Re-attaches the new gizmo if a selection is shown. */
  setMode(mode: ComponentGizmoMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    if (this.attached) this.enableActive();
  }

  /** Place the gizmo at `center` (local to `parent`) and attach the active gizmo for dragging. */
  attach(center: Pivot, parent: TransformNode): void {
    if (!this.node) this.create();
    this.node!.parent = parent;
    this.node!.position.set(center.x, center.y, center.z);
    this.node!.rotationQuaternion = Quaternion.Identity();
    this.node!.scaling.set(1, 1, 1);
    this.attached = true;
    this.enableActive();
  }

  /** Hide all gizmos (no selection). */
  detach(): void {
    this.attached = false;
    if (this.pos) this.pos.attachedNode = null;
    if (this.rot) this.rot.attachedNode = null;
    if (this.scale) this.scale.attachedNode = null;
  }

  /** Tear down the gizmos + helper node (called when leaving Edit Mode). */
  dispose(): void {
    this.pos?.dispose();
    this.rot?.dispose();
    this.scale?.dispose();
    this.node?.dispose();
    this.pos = this.rot = this.scale = undefined;
    this.node = undefined;
    this.isDragging = false;
    this.attached = false;
  }

  /** Enable only the gizmo matching the current mode; disable the others. */
  private enableActive(): void {
    const n = this.node ?? null;
    if (this.pos) this.pos.attachedNode = this.mode === 'move' ? n : null;
    if (this.rot) this.rot.attachedNode = this.mode === 'rotate' ? n : null;
    if (this.scale) this.scale.attachedNode = this.mode === 'scale' ? n : null;
  }

  private create(): void {
    this.node = new TransformNode('meshedit-gizmo', this.scene);
    this.node.rotationQuaternion = Quaternion.Identity();
    const layer = this.getLayer();

    this.pos = new PositionGizmo(layer);
    this.pos.updateGizmoRotationToMatchAttachedMesh = false;
    this.pos.onDragStartObservable.add(() => this.begin());
    this.pos.onDragObservable.add(() => {
      const cur = this.node!.position;
      this.handlers.translate(cur.x - this.lastPos.x, cur.y - this.lastPos.y, cur.z - this.lastPos.z);
      this.lastPos.copyFrom(cur);
    });
    this.pos.onDragEndObservable.add(() => this.end());

    this.rot = new RotationGizmo(layer);
    this.rot.updateGizmoRotationToMatchAttachedMesh = false;
    this.rot.onDragStartObservable.add(() => this.begin());
    this.rot.onDragObservable.add(() => {
      const cur = this.node!.rotationQuaternion ?? Quaternion.Identity();
      const delta = cur.multiply(Quaternion.Inverse(this.lastQuat)); // dq · last = cur
      this.lastQuat.copyFrom(cur);
      const p = this.node!.position;
      this.handlers.rotate({ x: delta.x, y: delta.y, z: delta.z, w: delta.w }, [p.x, p.y, p.z]);
    });
    this.rot.onDragEndObservable.add(() => this.end());

    this.scale = new ScaleGizmo(layer);
    this.scale.updateGizmoRotationToMatchAttachedMesh = false;
    this.scale.onDragStartObservable.add(() => this.begin());
    this.scale.onDragObservable.add(() => {
      const cur = this.node!.scaling;
      const sx = cur.x / (this.lastScale.x || 1);
      const sy = cur.y / (this.lastScale.y || 1);
      const sz = cur.z / (this.lastScale.z || 1);
      this.lastScale.copyFrom(cur);
      const p = this.node!.position;
      this.handlers.scale(sx, sy, sz, [p.x, p.y, p.z]);
    });
    this.scale.onDragEndObservable.add(() => this.end());
  }

  /** Snapshot the node's transform at drag start so per-frame diffs are incremental. */
  private begin(): void {
    this.isDragging = true;
    this.lastPos.copyFrom(this.node!.position);
    this.lastQuat.copyFrom(this.node!.rotationQuaternion ?? Quaternion.Identity());
    this.lastScale.copyFrom(this.node!.scaling);
    this.handlers.begin();
  }

  private end(): void {
    this.isDragging = false;
    this.handlers.end();
  }
}
