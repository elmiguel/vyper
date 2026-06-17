import { describe, it, expect } from 'vitest';
import { defaultImportTransform } from '@/types';
import { computeModelTransform, type Bounds } from './modelTransform';

// A 2×4×2 box centered at (1,2,3).
const bounds: Bounds = { min: { x: 0, y: 0, z: 2 }, max: { x: 2, y: 4, z: 4 } };

describe('computeModelTransform', () => {
  it('is identity for the default transform', () => {
    const r = computeModelTransform(defaultImportTransform(), bounds);
    expect(r.scaling).toEqual({ x: 1, y: 1, z: 1 });
    expect(r.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(r.rotationDeg).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('normalizeSize scales the largest dimension (4) to ~1 unit', () => {
    const r = computeModelTransform({ ...defaultImportTransform(), normalizeSize: true }, bounds);
    expect(r.scaling.x).toBeCloseTo(0.25);
    expect(r.scaling.y).toBeCloseTo(0.25);
  });

  it('multiplies the user scale on top of normalization', () => {
    const r = computeModelTransform({ ...defaultImportTransform(), normalizeSize: true, scale: { x: 2, y: 2, z: 2 } }, bounds);
    expect(r.scaling.x).toBeCloseTo(0.5); // 2 * (1/4)
  });

  it('recenter offsets the scaled center to the origin', () => {
    const r = computeModelTransform({ ...defaultImportTransform(), recenter: true }, bounds);
    // center is (1,2,3), scaling is identity → position = -center
    expect(r.position).toEqual({ x: -1, y: -2, z: -3 });
  });

  it('passes rotation through unchanged', () => {
    const r = computeModelTransform({ ...defaultImportTransform(), rotationDeg: { x: 0, y: 90, z: 0 } }, bounds);
    expect(r.rotationDeg).toEqual({ x: 0, y: 90, z: 0 });
  });
});
