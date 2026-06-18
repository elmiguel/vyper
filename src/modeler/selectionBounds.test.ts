import { describe, it, expect } from 'vitest';
import { HalfEdgeMesh } from '@/kernel/HalfEdgeMesh';
import { buildPrimitive } from '@/kernel/primitives';
import { selectionBounds } from './selectionBounds';

describe('selectionBounds', () => {
  it('returns a zeroed, count:0 result for an empty selection', () => {
    const m = buildPrimitive('cube', 2);
    const b = selectionBounds(m, []);
    expect(b.count).toBe(0);
    expect(b.center).toEqual([0, 0, 0]);
    expect(b.size).toEqual([0, 0, 0]);
  });

  it('computes centroid and size of a centered cube (all 8 verts)', () => {
    const m = buildPrimitive('cube', 2); // spans ±1 on each axis
    const all = m.vertices.map((_, i) => i);
    const b = selectionBounds(m, all);
    expect(b.count).toBe(8);
    expect(b.center[0]).toBeCloseTo(0);
    expect(b.center[1]).toBeCloseTo(0);
    expect(b.center[2]).toBeCloseTo(0);
    expect(b.size[0]).toBeCloseTo(2);
    expect(b.size[1]).toBeCloseTo(2);
    expect(b.size[2]).toBeCloseTo(2);
    expect(b.min).toEqual([-1, -1, -1]);
    expect(b.max).toEqual([1, 1, 1]);
  });

  it('skips tombstoned (removed) and out-of-range vertices', () => {
    const m = new HalfEdgeMesh();
    m.vertices = [
      { position: [0, 0, 0], halfEdge: -1 },
      { position: [4, 0, 0], halfEdge: -1, removed: true },
      { position: [2, 6, 0], halfEdge: -1 },
    ];
    const b = selectionBounds(m, [0, 1, 2, 99]); // 1 is removed, 99 is out of range
    expect(b.count).toBe(2);
    expect(b.center).toEqual([1, 3, 0]); // mean of (0,0,0) and (2,6,0)
    expect(b.size).toEqual([2, 6, 0]);
  });

  it('reports a single vertex as zero-size at its own position', () => {
    const m = new HalfEdgeMesh();
    m.vertices = [{ position: [5, -3, 7], halfEdge: -1 }];
    const b = selectionBounds(m, [0]);
    expect(b.count).toBe(1);
    expect(b.center).toEqual([5, -3, 7]);
    expect(b.size).toEqual([0, 0, 0]);
  });
});
