import { describe, it, expect } from 'vitest';
import {
  shapeForKind,
  isInsideLocal,
  segmentInsideLocal,
  clampInsideLocal,
  pushOutsideLocal,
  resolveConstraint,
  slideVelocity,
} from './volumeGeometry';

describe('slideVelocity (boundary = wall, not a pin)', () => {
  const nx = { x: 1, y: 0, z: 0 }; // allowed-side normal points +X

  it('cancels only the component heading into the boundary, keeping the slide', () => {
    // Moving into the forbidden side (−X) while also moving along it (+Z).
    expect(slideVelocity({ x: -3, y: 0, z: 5 }, nx)).toEqual({ x: 0, y: 0, z: 5 });
  });

  it('preserves velocity moving along or away from the boundary (can still leave)', () => {
    expect(slideVelocity({ x: 4, y: 0, z: 0 }, nx)).toEqual({ x: 4, y: 0, z: 0 }); // outward
    expect(slideVelocity({ x: 0, y: 2, z: 0 }, nx)).toEqual({ x: 0, y: 2, z: 0 }); // tangential
  });

  it('never fully zeroes a velocity that has a tangential part (no getting stuck)', () => {
    const out = slideVelocity({ x: -10, y: 0, z: 1 }, nx);
    expect(out).toEqual({ x: 0, y: 0, z: 1 }); // gravity/vertical + slide survive
  });
});

describe('shapeForKind', () => {
  it('maps mesh kinds onto the three volume shapes', () => {
    expect(shapeForKind('box')).toBe('box');
    expect(shapeForKind('square')).toBe('box');
    expect(shapeForKind('plane')).toBe('box');
    expect(shapeForKind('sphere')).toBe('sphere');
    expect(shapeForKind('circle')).toBe('sphere');
    expect(shapeForKind('cylinder')).toBe('cylinder');
    expect(shapeForKind('cone')).toBe('cylinder');
  });
});

describe('isInsideLocal', () => {
  it('box: within ±0.5 on every axis', () => {
    expect(isInsideLocal('box', { x: 0, y: 0, z: 0 })).toBe(true);
    expect(isInsideLocal('box', { x: 0.4, y: -0.4, z: 0.49 })).toBe(true);
    expect(isInsideLocal('box', { x: 0.6, y: 0, z: 0 })).toBe(false);
  });
  it('sphere: within radius 0.5', () => {
    expect(isInsideLocal('sphere', { x: 0.4, y: 0, z: 0 })).toBe(true);
    expect(isInsideLocal('sphere', { x: 0.4, y: 0.4, z: 0 })).toBe(false); // |p| ≈ 0.57
  });
  it('cylinder: radial ≤ 0.5 and |y| ≤ 0.7', () => {
    expect(isInsideLocal('cylinder', { x: 0.49, y: 0.69, z: 0 })).toBe(true);
    expect(isInsideLocal('cylinder', { x: 0, y: 0.8, z: 0 })).toBe(false); // too tall
    expect(isInsideLocal('cylinder', { x: 0.6, y: 0, z: 0 })).toBe(false); // too wide
  });
});

describe('clampInsideLocal', () => {
  it('pulls an outside point onto the boundary (then it reads as inside)', () => {
    const box = clampInsideLocal('box', { x: 2, y: 0, z: 0 });
    expect(box.x).toBeCloseTo(0.5);
    expect(isInsideLocal('box', box)).toBe(true);

    const sph = clampInsideLocal('sphere', { x: 1, y: 0, z: 0 });
    expect(Math.hypot(sph.x, sph.y, sph.z)).toBeCloseTo(0.5);

    const cyl = clampInsideLocal('cylinder', { x: 0, y: 5, z: 0 });
    expect(cyl.y).toBeCloseTo(0.7);
  });
  it('leaves an already-inside point unchanged', () => {
    expect(clampInsideLocal('box', { x: 0.1, y: 0.2, z: -0.3 })).toEqual({ x: 0.1, y: 0.2, z: -0.3 });
  });
});

describe('pushOutsideLocal', () => {
  it('box: pushes out along the shallowest axis', () => {
    // Deep in x, shallow in z → exits through the z face.
    const p = pushOutsideLocal('box', { x: 0.1, y: 0.1, z: 0.45 });
    expect(p.z).toBeCloseTo(0.5);
    expect(p.x).toBeCloseTo(0.1);
  });
  it('sphere: pushes to the surface along the radial', () => {
    const p = pushOutsideLocal('sphere', { x: 0.1, y: 0, z: 0 });
    expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(0.5);
  });
  it('cylinder: nearer the cap exits vertically', () => {
    const p = pushOutsideLocal('cylinder', { x: 0, y: 0.65, z: 0 });
    expect(p.y).toBeCloseTo(0.7);
  });
});

describe('resolveConstraint', () => {
  it('keepIn always constrains inward; keepOut always outward', () => {
    expect(resolveConstraint('keepIn', false, true, null).constrain).toBe('in');
    expect(resolveConstraint('keepOut', true, false, null).constrain).toBe('out');
  });

  it('trap latches "in" on first entry, then keeps the object inside', () => {
    // Outside, never entered → free.
    expect(resolveConstraint('trap', false, false, null)).toEqual({ constrain: null, lock: null });
    // Just entered → latches and constrains in.
    expect(resolveConstraint('trap', true, false, null)).toEqual({ constrain: 'in', lock: 'in' });
    // Already locked → stays constrained even when it slips outside.
    expect(resolveConstraint('trap', false, true, 'in').constrain).toBe('in');
  });

  it('oneWayOut latches "out" on first exit, then keeps the object out', () => {
    expect(resolveConstraint('oneWayOut', true, true, null)).toEqual({ constrain: null, lock: null });
    expect(resolveConstraint('oneWayOut', false, true, null)).toEqual({ constrain: 'out', lock: 'out' });
    expect(resolveConstraint('oneWayOut', true, false, 'out').constrain).toBe('out');
  });

  it('none never constrains', () => {
    expect(resolveConstraint('none', true, false, null).constrain).toBeNull();
  });
});

describe('segmentInsideLocal (swept / tunnel-proof)', () => {
  const above = { x: 0, y: 5, z: 0 };
  const below = { x: 0, y: -5, z: 0 };

  it('is true when an endpoint is inside', () => {
    expect(segmentInsideLocal('box', { x: 0, y: 0, z: 0 }, above)).toBe(true);
  });

  it('catches a segment that passes clean through the box (both endpoints outside)', () => {
    expect(segmentInsideLocal('box', above, below)).toBe(true);
  });

  it('is false when the whole segment misses the box', () => {
    expect(segmentInsideLocal('box', { x: 5, y: 5, z: 0 }, { x: 5, y: -5, z: 0 })).toBe(false);
  });

  it('works for a sphere volume too', () => {
    expect(segmentInsideLocal('sphere', above, below)).toBe(true);
    expect(segmentInsideLocal('sphere', { x: 2, y: 5, z: 0 }, { x: 2, y: -5, z: 0 })).toBe(false);
  });
});
