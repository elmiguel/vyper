import { describe, it, expect } from 'vitest';
import type { V3 } from '@/kernel/HalfEdgeMesh';
import { closestPointOnSoup } from './surfaceProject';

// Two triangles forming the unit square in the z=0 plane (corners 0..3).
const positions = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0];
const indices = [0, 1, 2, 0, 2, 3];

describe('closestPointOnSoup', () => {
  it('drops a point above the plane straight down onto it', () => {
    const q = closestPointOnSoup([0.3, 0.3, 5], positions, indices);
    expect(q[0]).toBeCloseTo(0.3);
    expect(q[1]).toBeCloseTo(0.3);
    expect(q[2]).toBeCloseTo(0);
  });

  it('clamps a point beyond a corner to that corner', () => {
    const q = closestPointOnSoup([2, 2, 0], positions, indices);
    expect(q).toEqual([1, 1, 0]);
  });

  it('clamps a point beyond an edge onto the edge', () => {
    const q = closestPointOnSoup([0.5, -3, 0], positions, indices);
    expect(q[0]).toBeCloseTo(0.5);
    expect(q[1]).toBeCloseTo(0);
    expect(q[2]).toBeCloseTo(0);
  });
});
