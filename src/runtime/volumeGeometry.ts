// Pure point-in-volume math, in the volume's *local* unit space (no Babylon, no
// DOM, so it's unit-testable). The runtime transforms a world point into a
// volume's local space (inverse world matrix) before calling these, which folds
// in the volume's position/rotation/scale — so we only reason about the raw
// primitive: a box of half-extent 0.5, a sphere of radius 0.5, a cylinder of
// radius 0.5 and half-height 0.7 (matching the meshes built in sceneBuilders).

import type { BoundaryMode } from '@/types';

export type VolumeShape = 'box' | 'sphere' | 'cylinder';

export interface P3 {
  x: number;
  y: number;
  z: number;
}

const BOX_HALF = 0.5;
const SPHERE_R = 0.5;
const CYL_R = 0.5;
const CYL_HALF_H = 0.7;

/** Map a mesh kind to the closest volume shape (2D shapes fold onto 3D ones). */
export function shapeForKind(kind: string): VolumeShape {
  switch (kind) {
    case 'sphere':
    case 'circle':
      return 'sphere';
    case 'cylinder':
    case 'cone':
      return 'cylinder';
    default:
      return 'box'; // box, square, plane, …
  }
}

/** Is a local-space point inside the unit primitive? */
export function isInsideLocal(shape: VolumeShape, p: P3): boolean {
  if (shape === 'sphere') return p.x * p.x + p.y * p.y + p.z * p.z <= SPHERE_R * SPHERE_R;
  if (shape === 'cylinder') return p.x * p.x + p.z * p.z <= CYL_R * CYL_R && Math.abs(p.y) <= CYL_HALF_H;
  return Math.abs(p.x) <= BOX_HALF && Math.abs(p.y) <= BOX_HALF && Math.abs(p.z) <= BOX_HALF;
}

/**
 * Whether the segment a→b touches the volume (both points in volume-local space). Used for
 * tunnel-proof dead-zone detection: a fast faller can move further in one frame than a thin volume
 * is deep and skip over the per-frame point test, so we also sample along its path. Returns true if
 * either endpoint is inside or any sampled point between them is. Sample count scales with the
 * segment length (capped) so long jumps still get enough samples.
 */
export function segmentInsideLocal(shape: VolumeShape, a: P3, b: P3): boolean {
  if (isInsideLocal(shape, a) || isInsideLocal(shape, b)) return true;
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const len = Math.hypot(dx, dy, dz);
  const steps = Math.min(64, Math.max(1, Math.ceil(len / 0.25)));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (isInsideLocal(shape, { x: a.x + dx * t, y: a.y + dy * t, z: a.z + dz * t })) return true;
  }
  return false;
}

/** Nearest point on/within the boundary (used to keep an object inside). */
export function clampInsideLocal(shape: VolumeShape, p: P3): P3 {
  if (shape === 'sphere') {
    const len = Math.hypot(p.x, p.y, p.z);
    if (len <= SPHERE_R || len === 0) return { ...p };
    const k = SPHERE_R / len;
    return { x: p.x * k, y: p.y * k, z: p.z * k };
  }
  if (shape === 'cylinder') {
    const y = clamp(p.y, -CYL_HALF_H, CYL_HALF_H);
    const rad = Math.hypot(p.x, p.z);
    if (rad <= CYL_R || rad === 0) return { x: p.x, y, z: p.z };
    const k = CYL_R / rad;
    return { x: p.x * k, y, z: p.z * k };
  }
  return { x: clamp(p.x, -BOX_HALF, BOX_HALF), y: clamp(p.y, -BOX_HALF, BOX_HALF), z: clamp(p.z, -BOX_HALF, BOX_HALF) };
}

/** Nearest point just outside the boundary (used to keep an object out). Assumes
 *  `p` is currently inside; pushes along the shallowest exit axis/direction. */
export function pushOutsideLocal(shape: VolumeShape, p: P3): P3 {
  if (shape === 'sphere') {
    const len = Math.hypot(p.x, p.y, p.z);
    if (len === 0) return { x: SPHERE_R, y: 0, z: 0 };
    const k = SPHERE_R / len;
    return { x: p.x * k, y: p.y * k, z: p.z * k };
  }
  if (shape === 'cylinder') {
    const rad = Math.hypot(p.x, p.z);
    const radialPen = CYL_R - rad; // how far inside the side wall
    const vertPen = CYL_HALF_H - Math.abs(p.y); // how far inside a cap
    if (vertPen < radialPen) {
      return { x: p.x, y: p.y >= 0 ? CYL_HALF_H : -CYL_HALF_H, z: p.z };
    }
    if (rad === 0) return { x: CYL_R, y: p.y, z: 0 };
    const k = CYL_R / rad;
    return { x: p.x * k, y: p.y, z: p.z * k };
  }
  // box: push out along the axis with the smallest penetration
  const pen = { x: BOX_HALF - Math.abs(p.x), y: BOX_HALF - Math.abs(p.y), z: BOX_HALF - Math.abs(p.z) };
  const axis = pen.x <= pen.y && pen.x <= pen.z ? 'x' : pen.y <= pen.z ? 'y' : 'z';
  const out = { ...p };
  out[axis] = (p[axis] >= 0 ? 1 : -1) * BOX_HALF;
  return out;
}

/**
 * Resolve a boundary mode to a per-frame constraint, given whether the object is
 * inside now, whether it was inside last frame, and any latched lock from a prior
 * crossing. Pure state machine — returns the constraint to apply and the new lock.
 *
 * `constrain: 'in'` = must be kept inside; `'out'` = must be kept outside; `null` = free.
 */
export function resolveConstraint(
  mode: BoundaryMode,
  inside: boolean,
  wasInside: boolean,
  lock: 'in' | 'out' | null,
): { constrain: 'in' | 'out' | null; lock: 'in' | 'out' | null } {
  switch (mode) {
    case 'keepIn':
      return { constrain: 'in', lock: null };
    case 'keepOut':
      return { constrain: 'out', lock: null };
    case 'trap': {
      // Latch to "inside" the first time the object enters; then it can't leave.
      const next = lock ?? (inside && !wasInside ? 'in' : null);
      return { constrain: next === 'in' ? 'in' : null, lock: next };
    }
    case 'oneWayOut': {
      // Latch to "outside" the first time the object leaves; then it can't return.
      const next = lock ?? (wasInside && !inside ? 'out' : null);
      return { constrain: next === 'out' ? 'out' : null, lock: next };
    }
    default:
      return { constrain: null, lock: null };
  }
}

/**
 * Sliding boundary response: remove the part of velocity `v` heading into a
 * boundary whose allowed-side (outward) unit normal is `n`. Tangential motion
 * (sliding along the boundary) and any outward motion are preserved, so a
 * constrained object glides along the boundary like a wall rather than stopping
 * dead / getting pinned. Returns `v` unchanged when it's already moving along or
 * away from the boundary.
 */
export function slideVelocity(v: P3, n: P3): P3 {
  const into = v.x * n.x + v.y * n.y + v.z * n.z; // < 0 ⇒ moving into the forbidden side
  if (into >= 0) return v;
  return { x: v.x - into * n.x, y: v.y - into * n.y, z: v.z - into * n.z };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
