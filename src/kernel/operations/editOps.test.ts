import { describe, it, expect } from 'vitest';
import { buildPrimitive } from '../primitives';
import { validateMesh } from '../validate';
import { deleteFaces, dissolveVertices, dissolveEdges, addFace, addPolygon, duplicateFaces } from './editOps';

describe('deleteFaces (kernel op)', () => {
  it('removes a face and prunes its now-unused vertices', () => {
    const m = buildPrimitive('cube', 2);
    const before = m.liveFaces().length;
    expect(deleteFaces(m, [m.liveFaces()[0]])).toBe(true);
    expect(m.liveFaces().length).toBe(before - 1);
    expect(validateMesh(m)).toEqual([]);
  });

  it('returns false when nothing matches', () => {
    const m = buildPrimitive('plane', 2);
    expect(deleteFaces(m, [999])).toBe(false);
  });
});

describe('dissolveVertices (kernel op)', () => {
  it('removes a vertex from its faces, dropping degenerate ones', () => {
    const m = buildPrimitive('grid', 2); // 4 quads sharing a center vertex
    const center = m.liveFaces()
      .flatMap((f) => m.faceVertices(f))
      .find((v, _, arr) => arr.filter((x) => x === v).length === 4)!; // shared by all 4
    expect(dissolveVertices(m, [center])).toBe(true);
    // Each quad loses the center corner → becomes a triangle (still ≥3).
    expect(validateMesh(m)).toEqual([]);
  });
});

describe('dissolveEdges (kernel op)', () => {
  it('merges the two faces sharing an edge into one n-gon', () => {
    const m = buildPrimitive('grid', 2); // 4 quads
    const interior = m.liveEdges().find((e) => m.edgeFaces(e).length === 2)!;
    const before = m.liveFaces().length;
    expect(dissolveEdges(m, [interior])).toBe(true);
    expect(m.liveFaces().length).toBe(before - 1); // two quads → one hexagon
    expect(validateMesh(m)).toEqual([]);
  });
});

describe('addFace (kernel op)', () => {
  it('creates a face from selected vertices', () => {
    const m = buildPrimitive('grid', 2);
    const before = m.liveFaces().length;
    const tri = m.faceVertices(m.liveFaces()[0]).slice(0, 3); // 3 existing verts
    expect(addFace(m, tri)).toBe(true);
    expect(m.liveFaces().length).toBe(before + 1);
  });

  it('refuses fewer than three vertices', () => {
    const m = buildPrimitive('grid', 2);
    expect(addFace(m, [0, 1])).toBe(false);
  });
});

describe('addPolygon (kernel op)', () => {
  it('appends a polygon from explicit positions (draw poly)', () => {
    const m = buildPrimitive('plane', 2);
    const before = m.liveFaces().length;
    expect(addPolygon(m, [[0, 0, 0], [1, 0, 0], [1, 0, 1]])).toBe(true);
    expect(m.liveFaces().length).toBe(before + 1);
  });
});

describe('duplicateFaces (kernel op)', () => {
  it('duplicates faces as independent geometry offset by a delta', () => {
    const m = buildPrimitive('plane', 2);
    const before = m.liveFaces().length;
    const dup = duplicateFaces(m, m.liveFaces(), [0, 1, 0]);
    expect(dup.length).toBe(1);
    expect(m.liveFaces().length).toBe(before + 1);
    // The copy sits 1 unit higher in Y.
    expect(Math.max(...m.vertices.map((v) => v.position[1]))).toBeCloseTo(1, 5);
  });
});
