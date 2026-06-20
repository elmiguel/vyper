import { describe, it, expect } from 'vitest';
import type { V3 } from '@/kernel/HalfEdgeMesh';
import { coonsGrid, gridQuads } from './patchGrid';

/** Boundary samples of the unit square in the XY plane at resolution R. */
function unitSquareBoundary(R: number) {
  const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0];
  const c00: V3 = [0, 0, 0];
  const c01: V3 = [1, 0, 0];
  const c11: V3 = [1, 1, 0];
  const c10: V3 = [0, 1, 0];
  const line = (a: V3, b: V3) => Array.from({ length: R + 1 }, (_, i) => lerp(a, b, i / R));
  return {
    bottom: line(c00, c01), // c0→c1
    right: line(c01, c11), //  c1→c2
    top: line(c10, c11), //    c3→c2
    left: line(c00, c10), //   c0→c3
  };
}

describe('coonsGrid', () => {
  it('produces a regular grid over a planar square', () => {
    const R = 4;
    const { bottom, right, top, left } = unitSquareBoundary(R);
    const grid = coonsGrid(bottom, right, top, left);
    expect(grid).toHaveLength(R + 1);
    expect(grid[0]).toHaveLength(R + 1);
    // Corners exact.
    expect(grid[0][0]).toEqual([0, 0, 0]);
    expect(grid[R][R][0]).toBeCloseTo(1);
    expect(grid[R][R][1]).toBeCloseTo(1);
    // Center sits at the square's centroid.
    expect(grid[R / 2][R / 2][0]).toBeCloseTo(0.5);
    expect(grid[R / 2][R / 2][1]).toBeCloseTo(0.5);
    // Evenly spaced interior point.
    expect(grid[1][2][0]).toBeCloseTo(0.5);
    expect(grid[1][2][1]).toBeCloseTo(0.25);
  });
});

describe('gridQuads', () => {
  it('emits R*R quads, all 4-sided', () => {
    const faces = gridQuads(5, 5); // 4x4 cells
    expect(faces).toHaveLength(16);
    expect(faces.every((f) => f.length === 4)).toBe(true);
    expect(faces[0]).toEqual([0, 1, 6, 5]); // first cell, cols=5
  });
});
