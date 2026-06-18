import type { ModelerState } from './modelerStore';
import type { EditActionsCtx } from './modelerEditActions';
import { selectionBounds, type SelectionBounds } from './selectionBounds';

/** Axis key for the Inspector's per-axis numeric fields. */
export type InspectorAxis = 'x' | 'y' | 'z';

const AXIS_INDEX: Record<InspectorAxis, 0 | 1 | 2> = { x: 0, y: 1, z: 2 };
const DEG = Math.PI / 180;
/** Smallest extent we'll scale: a zero/near-zero axis (single vertex, flat plane) can't be
 *  resized by a ratio, so dimension edits on it are ignored rather than dividing by ~0. */
const MIN_EXTENT = 1e-6;

/** Unit quaternion for an intrinsic X→Y→Z euler rotation (degrees). Kept Babylon-free to match
 *  the kernel-local transform actions it feeds. */
function quatFromEulerDeg(x: number, y: number, z: number): { x: number; y: number; z: number; w: number } {
  const hx = x * DEG * 0.5, hy = y * DEG * 0.5, hz = z * DEG * 0.5;
  const cx = Math.cos(hx), sx = Math.sin(hx);
  const cy = Math.cos(hy), sy = Math.sin(hy);
  const cz = Math.cos(hz), sz = Math.sin(hz);
  // qx * qy * qz
  return {
    x: sx * cy * cz + cx * sy * sz,
    y: cx * sy * cz - sx * cy * sz,
    z: cx * cy * sz + sx * sy * cz,
    w: cx * cy * cz - sx * sy * sz,
  };
}

/**
 * Numeric-transform actions for the Studio Inspector: set the selection's absolute centre
 * (position) and dimensions (size), and rotate it by an euler delta. Each delegates to the
 * existing live-transform primitives (`beginTransform → …Live → endTransform`) so the change
 * lands as a single undoable command and persists, exactly like a gizmo drag. The target set
 * is whatever `selectedVertices()` resolves to, so edits follow the current component mode
 * (whole object in Object mode; the picked verts/edges/faces in component modes).
 */
export function createInspectorActions(ctx: EditActionsCtx): Pick<
  ModelerState,
  'selectionBounds' | 'setSelectionCenter' | 'setSelectionDimension' | 'nudgeSelectionRotation'
> {
  const bounds = (): SelectionBounds => selectionBounds(ctx.mesh(), ctx.selectedVertices());

  return {
    selectionBounds: bounds,

    setSelectionCenter: (axis, value) => {
      const b = bounds();
      if (b.count === 0) return;
      const i = AXIS_INDEX[axis];
      const delta = value - b.center[i];
      if (delta === 0) return;
      const s = ctx.get();
      s.beginTransform();
      s.translateSelectionLive(axis === 'x' ? delta : 0, axis === 'y' ? delta : 0, axis === 'z' ? delta : 0);
      s.endTransform();
    },

    setSelectionDimension: (axis, value) => {
      const b = bounds();
      if (b.count === 0) return;
      const i = AXIS_INDEX[axis];
      const current = b.size[i];
      if (current < MIN_EXTENT) return; // nothing to scale along a flat/zero axis
      const factor = Math.max(value, 0) / current;
      if (factor === 1) return;
      const s = ctx.get();
      s.beginTransform();
      s.scaleSelectionLive(axis === 'x' ? factor : 1, axis === 'y' ? factor : 1, axis === 'z' ? factor : 1, b.center);
      s.endTransform();
    },

    nudgeSelectionRotation: (euler) => {
      const b = bounds();
      if (b.count === 0) return;
      if (euler.x === 0 && euler.y === 0 && euler.z === 0) return;
      const q = quatFromEulerDeg(euler.x, euler.y, euler.z);
      const s = ctx.get();
      s.beginTransform();
      s.rotateSelectionLive(q, b.center);
      s.endTransform();
    },
  };
}
