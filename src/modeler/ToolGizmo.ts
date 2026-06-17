import type { Scene } from '@babylonjs/core/scene';
import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Quaternion } from '@babylonjs/core/Maths/math.vector';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { PositionGizmo } from '@babylonjs/core/Gizmos/positionGizmo';
import { RotationGizmo } from '@babylonjs/core/Gizmos/rotationGizmo';
import type { UtilityLayerRenderer } from '@babylonjs/core/Rendering/utilityLayerRenderer';
import type { LoopCutDragMode } from './ModelerEditTools';

/**
 * The indicator gizmo shown at the loop while a loop-cut drag is in progress: the real
 * Babylon Move/Rotate gizmo anchored at the ring centroid, so the user sees where the cut is
 * being placed. It is purely visual — never wired to the transform handlers — and it freezes
 * the ArcRotate camera's pointer drag while shown so the left-drag slides the loop instead of
 * orbiting. Lives apart from {@link ModelerScene}'s selection gizmos to keep them decoupled.
 */
export class ToolGizmo {
  private readonly node: TransformNode;
  private readonly pos: PositionGizmo;
  private readonly rot: RotationGizmo;

  constructor(
    scene: Scene,
    layer: UtilityLayerRenderer,
    private readonly camera: ArcRotateCamera,
    private readonly canvas: HTMLCanvasElement,
  ) {
    this.node = new TransformNode('toolGizmoNode', scene);
    this.pos = new PositionGizmo(layer);
    this.pos.updateGizmoRotationToMatchAttachedMesh = false;
    this.rot = new RotationGizmo(layer);
    this.pos.attachedNode = null;
    this.rot.attachedNode = null;
  }

  /** Show the gizmo for `mode` at a model-space centroid and freeze the camera. We fully
   *  detach camera control rather than masking mouse buttons: the ArcRotate input latches the
   *  active button on pointer-down, so masking after the press is racy, whereas detaching
   *  removes the move listeners outright (re-added on {@link end}; the button restriction set
   *  by the scene persists across re-attach). */
  begin(mode: LoopCutDragMode, centroid: [number, number, number]): void {
    this.node.position.set(centroid[0], centroid[1], centroid[2]);
    this.node.rotationQuaternion = Quaternion.Identity();
    this.pos.attachedNode = mode === 'move' ? this.node : null;
    this.rot.attachedNode = mode === 'rotate' ? this.node : null;
    this.camera.detachControl();
  }

  /** Move the gizmo to a new centroid during the drag. */
  move(centroid: [number, number, number]): void {
    this.node.position.set(centroid[0], centroid[1], centroid[2]);
  }

  /** Hide the gizmo and restore camera control. */
  end(): void {
    this.pos.attachedNode = null;
    this.rot.attachedNode = null;
    this.camera.attachControl(this.canvas, true);
  }
}
