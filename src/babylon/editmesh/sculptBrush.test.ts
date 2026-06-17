import { describe, it, expect } from 'vitest';
import { buildEditPrimitive } from './primitives';
import { applySculptBrush, falloff, defaultSculptBrush } from './sculptBrush';

describe('falloff', () => {
  it('is 1 at the center and 0 at/beyond the radius', () => {
    expect(falloff(0)).toBeCloseTo(1, 6);
    expect(falloff(1)).toBeCloseTo(0, 6);
    expect(falloff(1.5)).toBe(0);
    expect(falloff(0.5)).toBeGreaterThan(0);
    expect(falloff(0.5)).toBeLessThan(1);
  });
});

describe('applySculptBrush', () => {
  it('draw pushes nearby vertices along the hit normal', () => {
    const m = buildEditPrimitive('grid', 8); // flat plane at y=0, faces +Y
    const before = m.vertices.map((v) => v.y);
    const touched = applySculptBrush(m, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, {
      radius: 2,
      strength: 1,
      mode: 'draw',
    });
    expect(touched.size).toBeGreaterThan(0);
    // The center vertex rose the most; far vertices outside the radius are untouched.
    const center = m.vertices.findIndex((v) => Math.abs(v.x) < 1e-6 && Math.abs(v.z) < 1e-6);
    expect(m.vertices[center].y).toBeGreaterThan(before[center]);
    // grid(8) spans -4..4 in integer steps; the ±4 corner is well outside radius 2.
    const corner = m.vertices.findIndex((v) => Math.abs(v.x) > 3.9 && Math.abs(v.z) > 3.9);
    expect(corner).toBeGreaterThanOrEqual(0);
    expect(m.vertices[corner].y).toBeCloseTo(before[corner], 6);
  });

  it('invert pushes the opposite way', () => {
    const m = buildEditPrimitive('grid', 8);
    applySculptBrush(m, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { radius: 2, strength: 1, mode: 'draw', invert: true });
    const center = m.vertices.findIndex((v) => Math.abs(v.x) < 1e-6 && Math.abs(v.z) < 1e-6);
    expect(m.vertices[center].y).toBeLessThan(0);
  });

  it('falls off with distance — center moves more than the rim', () => {
    const m = buildEditPrimitive('grid', 8); // -4..4 in integer steps
    applySculptBrush(m, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { radius: 3, strength: 1, mode: 'draw' });
    const center = m.vertices.find((v) => Math.abs(v.x) < 1e-6 && Math.abs(v.z) < 1e-6)!;
    const near = m.vertices.find((v) => Math.abs(v.x - 2) < 1e-6 && Math.abs(v.z) < 1e-6)!;
    expect(center.y).toBeGreaterThan(near.y);
    expect(near.y).toBeGreaterThan(0);
  });

  it('grab translates affected vertices by the drag delta (scaled by falloff)', () => {
    const m = buildEditPrimitive('grid', 8);
    applySculptBrush(m, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { radius: 2, strength: 1, mode: 'grab' }, {
      x: 0,
      y: 1,
      z: 0,
    });
    const center = m.vertices.find((v) => Math.abs(v.x) < 1e-6 && Math.abs(v.z) < 1e-6)!;
    expect(center.y).toBeCloseTo(1, 5); // full falloff at center
  });

  it('smooth relaxes a spike toward its neighbors', () => {
    const m = buildEditPrimitive('grid', 8);
    // Raise one interior vertex into a spike.
    const spike = m.vertices.findIndex((v) => Math.abs(v.x) < 1e-6 && Math.abs(v.z) < 1e-6);
    m.vertices[spike].y = 5;
    applySculptBrush(m, { x: 0, y: 5, z: 0 }, { x: 0, y: 1, z: 0 }, { radius: 4, strength: 1, mode: 'smooth' });
    expect(m.vertices[spike].y).toBeLessThan(5); // pulled down toward flat neighbors
  });

  it('touches nothing when the hit is outside every vertex radius', () => {
    const m = buildEditPrimitive('grid', 4);
    const touched = applySculptBrush(m, { x: 100, y: 0, z: 100 }, { x: 0, y: 1, z: 0 }, defaultSculptBrush());
    expect(touched.size).toBe(0);
  });
});
