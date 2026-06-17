import type { ImportTransform, Vec3 } from '@/types';

/** Axis-aligned bounds of a loaded model, in its own local space. */
export interface Bounds {
  min: Vec3;
  max: Vec3;
}

/** Resolved transform applied to a model's root node. */
export interface ResolvedTransform {
  position: Vec3;
  rotationDeg: Vec3;
  scaling: Vec3;
}

const maxDim = (b: Bounds) => Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z);
const center = (b: Bounds): Vec3 => ({
  x: (b.min.x + b.max.x) / 2,
  y: (b.min.y + b.max.y) / 2,
  z: (b.min.z + b.max.z) / 2,
});

/**
 * Resolve an asset's ImportTransform against a model's bounds into a concrete
 * root-node transform. Pure (no Babylon) so it's shared by the preview and scene
 * placement, and unit-testable.
 *
 * - `normalizeSize` scales so the largest dimension becomes ~1 unit (before `scale`).
 * - `scale` then multiplies component-wise.
 * - `recenter` offsets so the model's (scaled) bounding-box center sits at the
 *   origin. Note: the offset is computed pre-rotation, so a recentered model that
 *   is also rotated may not be pixel-perfect centered — adequate for placement.
 */
export function computeModelTransform(t: ImportTransform, b: Bounds): ResolvedTransform {
  const norm = t.normalizeSize && maxDim(b) > 0 ? 1 / maxDim(b) : 1;
  const scaling: Vec3 = { x: t.scale.x * norm, y: t.scale.y * norm, z: t.scale.z * norm };
  const c = center(b);
  const position: Vec3 = t.recenter
    ? { x: -c.x * scaling.x, y: -c.y * scaling.y, z: -c.z * scaling.z }
    : { x: 0, y: 0, z: 0 };
  return { position, rotationDeg: { ...t.rotationDeg }, scaling };
}
