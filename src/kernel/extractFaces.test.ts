import { describe, it, expect } from 'vitest';
import { buildPrimitive } from './primitives';
import { toGeometry, extractFacesGeometry } from './render';

describe('extractFacesGeometry', () => {
  it('extracts a subset of faces into a standalone geometry', () => {
    const m = buildPrimitive('cube', 2); // 6 quad faces, 8 verts
    const faces = m.liveFaces();
    const geo = extractFacesGeometry(m, faces.slice(0, 3));
    expect(geo.polygons).toHaveLength(3);
    // 3 quads → 6 triangles → 18 indices, 18 positions*3.
    expect(geo.indices).toHaveLength(18);
    expect(geo.positions.length).toBe(18 * 3);
    // Only the vertices those 3 faces touch are re-indexed (≤ all 8).
    expect(geo.polyVerts!.length / 3).toBeLessThanOrEqual(8);
  });

  it('extracting every face matches the full toGeometry polygon count', () => {
    const m = buildPrimitive('cube', 2);
    const full = toGeometry(m);
    const all = extractFacesGeometry(m, m.liveFaces());
    expect(all.polygons!.length).toBe(full.polygons!.length);
  });

  it('skips removed / unknown face ids', () => {
    const m = buildPrimitive('cube', 2);
    const geo = extractFacesGeometry(m, [0, 999]); // 999 is out of range
    expect(geo.polygons).toHaveLength(1);
  });

  it('returns empty geometry for an empty face set', () => {
    const m = buildPrimitive('cube', 2);
    const geo = extractFacesGeometry(m, []);
    expect(geo.polygons).toHaveLength(0);
    expect(geo.positions).toHaveLength(0);
  });
});
