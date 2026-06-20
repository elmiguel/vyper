import { describe, it, expect } from 'vitest';
import { HalfEdgeMesh } from '@/kernel/HalfEdgeMesh';
import { selectionBounds } from './selectionBounds';

/** A unit quad in the XZ plane (4 verts, ids 0..3). */
function quad(): HalfEdgeMesh {
  const m = new HalfEdgeMesh();
  m.buildFromPolygons(
    [[0, 0, 0], [2, 0, 0], [2, 0, 2], [0, 0, 2]],
    [[0, 1, 2, 3]],
  );
  return m;
}

describe('selectionBounds', () => {
  it('returns an all-zero result with count 0 for an empty selection', () => {
    const b = selectionBounds(quad(), []);
    expect(b.count).toBe(0);
    expect(b.center).toEqual([0, 0, 0]);
    expect(b.size).toEqual([0, 0, 0]);
  });

  it('computes centroid, min/max and size over the selected vertices', () => {
    const b = selectionBounds(quad(), [0, 1, 2, 3]);
    expect(b.count).toBe(4);
    expect(b.center).toEqual([1, 0, 1]);
    expect(b.min).toEqual([0, 0, 0]);
    expect(b.max).toEqual([2, 0, 2]);
    expect(b.size).toEqual([2, 0, 2]); // flat in Y
  });

  it('skips removed/out-of-range vertex ids without throwing', () => {
    const b = selectionBounds(quad(), [0, 1, 999]);
    expect(b.count).toBe(2);
    expect(b.center).toEqual([1, 0, 0]);
  });
});
