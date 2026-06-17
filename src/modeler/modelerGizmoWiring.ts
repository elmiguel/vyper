import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { PositionGizmo } from '@babylonjs/core/Gizmos/positionGizmo';
import type { RotationGizmo } from '@babylonjs/core/Gizmos/rotationGizmo';
import type { ScaleGizmo } from '@babylonjs/core/Gizmos/scaleGizmo';
import type { TransformHandlers } from './ModelerScene';

/** The selection gizmos + the scratch state {@link wireTransformGizmos} mutates across a drag. */
export interface GizmoWiring {
  pos: PositionGizmo;
  rot: RotationGizmo;
  scale: ScaleGizmo;
  node: TransformNode;
  lastPos: Vector3;
  lastQuat: Quaternion;
  lastScale: Vector3;
  getTransform: () => TransformHandlers | undefined;
}

/**
 * Wire the Move/Rotate/Scale gizmos so each drag reports an incremental delta to the active
 * {@link TransformHandlers} (begin → repeated delta → end). The gizmo node accumulates the
 * absolute transform; we diff it against the last frame's value (held in the scratch fields)
 * to emit per-frame deltas the kernel applies. Extracted from {@link ModelerScene} to keep
 * that file within the size budget.
 */
export function wireTransformGizmos(g: GizmoWiring): void {
  g.pos.onDragStartObservable.add(() => {
    g.lastPos.copyFrom(g.node.position);
    g.getTransform()?.begin();
  });
  g.pos.onDragObservable.add(() => {
    const d = g.node.position.subtract(g.lastPos);
    g.lastPos.copyFrom(g.node.position);
    g.getTransform()?.translate(d.x, d.y, d.z);
  });
  g.pos.onDragEndObservable.add(() => g.getTransform()?.end());

  g.rot.onDragStartObservable.add(() => {
    g.lastQuat.copyFrom(g.node.rotationQuaternion ?? Quaternion.Identity());
    g.getTransform()?.begin();
  });
  g.rot.onDragObservable.add(() => {
    const cur = g.node.rotationQuaternion ?? Quaternion.Identity();
    const delta = cur.multiply(Quaternion.Inverse(g.lastQuat)); // dq · last = cur
    g.lastQuat.copyFrom(cur);
    const p = g.node.position;
    g.getTransform()?.rotate({ x: delta.x, y: delta.y, z: delta.z, w: delta.w }, [p.x, p.y, p.z]);
  });
  g.rot.onDragEndObservable.add(() => g.getTransform()?.end());

  g.scale.onDragStartObservable.add(() => {
    g.lastScale.copyFrom(g.node.scaling);
    g.getTransform()?.begin();
  });
  g.scale.onDragObservable.add(() => {
    const cur = g.node.scaling;
    const sx = cur.x / (g.lastScale.x || 1);
    const sy = cur.y / (g.lastScale.y || 1);
    const sz = cur.z / (g.lastScale.z || 1);
    g.lastScale.copyFrom(cur);
    const p = g.node.position;
    g.getTransform()?.scale(sx, sy, sz, [p.x, p.y, p.z]);
  });
  g.scale.onDragEndObservable.add(() => g.getTransform()?.end());
}
