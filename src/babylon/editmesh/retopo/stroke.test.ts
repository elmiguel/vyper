import { describe, it, expect } from 'vitest';
import type { V3 } from '@/kernel/HalfEdgeMesh';
import { simplifyPolyline, resampleCurve } from './stroke';

describe('simplifyPolyline (Douglas–Peucker)', () => {
  it('collapses near-collinear points to the endpoints', () => {
    const line: V3[] = [[0, 0, 0], [1, 0.001, 0], [2, 0, 0], [3, 0.001, 0], [4, 0, 0]];
    expect(simplifyPolyline(line, 0.01)).toEqual([[0, 0, 0], [4, 0, 0]]);
  });

  it('keeps a point that deviates beyond epsilon', () => {
    const bend: V3[] = [[0, 0, 0], [1, 1, 0], [2, 0, 0]];
    const out = simplifyPolyline(bend, 0.1);
    expect(out).toHaveLength(3); // the apex survives
    expect(out[1]).toEqual([1, 1, 0]);
  });

  it('returns short polylines unchanged', () => {
    const two: V3[] = [[0, 0, 0], [1, 0, 0]];
    expect(simplifyPolyline(two, 0.5)).toEqual(two);
  });
});

describe('resampleCurve (Catmull-Rom)', () => {
  it('returns segments+1 points with endpoints preserved', () => {
    const pts: V3[] = [[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0]];
    const out = resampleCurve(pts, 6);
    expect(out).toHaveLength(7);
    expect(out[0]).toEqual([0, 0, 0]);
    expect(out[6]).toEqual([3, 0, 0]);
  });

  it('spaces samples roughly evenly along a straight line', () => {
    const pts: V3[] = [[0, 0, 0], [10, 0, 0]];
    const out = resampleCurve(pts, 5);
    expect(out).toHaveLength(6);
    for (let i = 0; i < out.length; i++) expect(out[i][0]).toBeCloseTo((10 * i) / 5, 4);
  });

  it('degrades gracefully for degenerate input', () => {
    expect(resampleCurve([[1, 1, 1]], 4)).toEqual([[1, 1, 1]]);
  });
});
