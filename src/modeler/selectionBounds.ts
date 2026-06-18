import type { HalfEdgeMesh, V3 } from '@/kernel/HalfEdgeMesh';

/** Axis-aligned bounds of a set of kernel vertices, used by the Studio Inspector to show and
 *  edit a selection's position (centroid) and dimensions (size). */
export interface SelectionBounds {
  /** Number of live vertices that contributed (0 ⇒ the other fields are all zero). */
  count: number;
  /** Centroid (mean) of the contributing vertices. */
  center: V3;
  /** Per-axis min corner of the AABB. */
  min: V3;
  /** Per-axis max corner of the AABB. */
  max: V3;
  /** Per-axis extent (max − min): the width / height / depth of the selection. */
  size: V3;
}

const ZERO: SelectionBounds = { count: 0, center: [0, 0, 0], min: [0, 0, 0], max: [0, 0, 0], size: [0, 0, 0] };

/**
 * Compute the centroid and axis-aligned bounding box of the given kernel vertices.
 *
 * Tombstoned (removed) or out-of-range vertex ids are skipped, so callers can pass the raw
 * result of `selectedVertices()` without pre-filtering. With no live vertices the result is
 * all-zero with `count: 0` — the Inspector treats that as "nothing to edit".
 */
export function selectionBounds(mesh: HalfEdgeMesh, vertIds: Iterable<number>): SelectionBounds {
  let count = 0;
  let sx = 0, sy = 0, sz = 0;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const v of vertIds) {
    const vert = mesh.vertices[v];
    if (!vert || vert.removed) continue;
    const [x, y, z] = vert.position;
    count++;
    sx += x; sy += y; sz += z;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }

  if (count === 0) return { ...ZERO, center: [0, 0, 0], min: [0, 0, 0], max: [0, 0, 0], size: [0, 0, 0] };

  return {
    count,
    center: [sx / count, sy / count, sz / count],
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    size: [maxX - minX, maxY - minY, maxZ - minZ],
  };
}
