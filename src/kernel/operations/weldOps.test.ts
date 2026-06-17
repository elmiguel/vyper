import { describe, it, expect } from 'vitest';
import { buildPrimitive } from '../primitives';
import { validateMesh } from '../validate';
import { mergeVertices, collapseEdges, averageVertices } from './weldOps';

describe('mergeVertices', () => {
  it('welds two corners of a quad to their center (quad → triangle)', () => {
    const m = buildPrimitive('plane', 2);
    const loop = m.faceVertices(m.liveFaces()[0]);
    const before = m.vertices.filter((v) => !v.removed).length;
    expect(mergeVertices(m, [loop[0], loop[1]])).toBe(true);
    expect(m.vertices.filter((v) => !v.removed).length).toBe(before - 1);
    expect(m.faceVertices(m.liveFaces()[0]).length).toBe(3);
    expect(validateMesh(m)).toEqual([]);
  });
});

describe('collapseEdges', () => {
  it('collapses an edge, welding its endpoints', () => {
    const m = buildPrimitive('grid', 2);
    const before = m.vertices.filter((v) => !v.removed).length;
    expect(collapseEdges(m, [m.liveEdges()[0]])).toBe(true);
    expect(m.vertices.filter((v) => !v.removed).length).toBe(before - 1);
    expect(validateMesh(m)).toEqual([]);
  });
});

describe('averageVertices', () => {
  it('moves a vertex toward its neighbours without changing topology', () => {
    const m = buildPrimitive('grid', 4);
    const before = m.liveFaces().length;
    const v = m.liveFaces().flatMap((f) => m.faceVertices(f)).find((x, _, arr) => arr.filter((y) => y === x).length === 4)!;
    expect(averageVertices(m, [v])).toBe(true);
    expect(m.liveFaces().length).toBe(before); // topology unchanged
    expect(validateMesh(m)).toEqual([]);
  });
});
