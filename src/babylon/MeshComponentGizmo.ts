import type { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { PositionGizmo } from '@babylonjs/core/Gizmos/positionGizmo';
import { UtilityLayerRenderer } from '@babylonjs/core/Rendering/utilityLayerRenderer';

/** Local-space translation delta emitted on each gizmo drag frame. */
export interface DragDelta {
  x: number;
  y: number;
  z: number;
}

/**
 * The translate gizmo that drives Edit-Mode component (vertex/edge/face) moves. It owns a
 * {@link PositionGizmo} on a helper {@link TransformNode}, reports per-frame deltas via
 * `onDrag`, and fires `onDragEnd` on release. Extracted from MeshEditController so the
 * controller stays focused on selection/preview; the controller applies the delta to the
 * selected vertices and rebuilds the preview.
 */
export class MeshComponentGizmo {
  private gizmo?: PositionGizmo;
  private node?: TransformNode;
  private last?: Vector3;
  private isDragging = false;

  constructor(
    private readonly scene: Scene,
    private readonly getLayer: () => UtilityLayerRenderer,
    private readonly onDrag: (d: DragDelta) => void,
    private readonly onDragEnd: () => void,
  ) {}

  /** True while the user is dragging the gizmo (callers suppress marquee/select). */
  get dragging(): boolean {
    return this.isDragging;
  }

  /** Place the gizmo at `center` (local to `parent`) and attach it for dragging. */
  attach(center: DragDelta, parent: TransformNode): void {
    if (!this.gizmo) this.create();
    this.node!.parent = parent;
    this.node!.position.set(center.x, center.y, center.z);
    this.last = this.node!.position.clone();
    this.gizmo!.attachedNode = this.node!;
  }

  /** Hide the gizmo (no selection). */
  detach(): void {
    if (this.gizmo) this.gizmo.attachedNode = null;
    this.last = undefined;
  }

  /** Tear down the gizmo + helper node (called when leaving Edit Mode). */
  dispose(): void {
    this.gizmo?.dispose();
    this.node?.dispose();
    this.gizmo = undefined;
    this.node = undefined;
    this.last = undefined;
    this.isDragging = false;
  }

  private create(): void {
    this.node = new TransformNode('meshedit-gizmo', this.scene);
    this.gizmo = new PositionGizmo(this.getLayer());
    this.gizmo.updateGizmoRotationToMatchAttachedMesh = false;
    this.gizmo.onDragObservable.add(() => {
      this.isDragging = true;
      if (!this.node || !this.last) return;
      const cur = this.node.position;
      this.onDrag({ x: cur.x - this.last.x, y: cur.y - this.last.y, z: cur.z - this.last.z });
      this.last = cur.clone();
    });
    this.gizmo.onDragEndObservable.add(() => {
      this.isDragging = false;
      this.onDragEnd();
    });
  }
}
