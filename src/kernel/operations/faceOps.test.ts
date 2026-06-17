import { describe, it, expect } from 'vitest';
import { buildPrimitive } from '../primitives';
import { validateMesh } from '../validate';
import { triangulateFaces, quadrangulateFaces, pokeFaces, reverseFaces, extractFaces } from './faceOps';

describe('triangulateFaces', () => {
  it('splits every quad into two triangles', () => {
    const m = buildPrimitive('cube', 2);
    expect(triangulateFaces(m, [])).toBe(true); // all faces
    expect(m.liveFaces().length).toBe(12);
    expect(m.liveFaces().every((f) => m.faceVertices(f).length === 3)).toBe(true);
    expect(validateMesh(m)).toEqual([]);
  });
});

describe('quadrangulateFaces', () => {
  it('merges a triangulated cube back into quads', () => {
    const m = buildPrimitive('cube', 2);
    triangulateFaces(m, []);
    expect(quadrangulateFaces(m, [])).toBe(true);
    expect(m.liveFaces().length).toBe(6);
    expect(m.liveFaces().every((f) => m.faceVertices(f).length === 4)).toBe(true);
    expect(validateMesh(m)).toEqual([]);
  });
});

describe('pokeFaces', () => {
  it('adds a center vertex and fans a quad into 4 triangles', () => {
    const m = buildPrimitive('plane', 2); // 1 quad
    expect(pokeFaces(m, m.liveFaces())).toBe(true);
    expect(m.liveFaces().length).toBe(4);
    expect(validateMesh(m)).toEqual([]);
  });
});

describe('reverseFaces', () => {
  it('flips face winding (reverses the loop order)', () => {
    const m = buildPrimitive('plane', 2);
    const before = m.faceVertices(m.liveFaces()[0]);
    expect(reverseFaces(m, m.liveFaces())).toBe(true);
    const after = m.faceVertices(m.liveFaces()[0]);
    expect(after).not.toEqual(before); // winding changed
    expect([...after].sort()).toEqual([...before].sort()); // same vertices
    expect(validateMesh(m)).toEqual([]);
  });
});

describe('extractFaces', () => {
  it('detaches a face into its own shell (no shared verts)', () => {
    const m = buildPrimitive('cube', 2);
    const f = m.liveFaces()[0];
    const beforeVerts = m.vertices.filter((v) => !v.removed).length;
    extractFaces(m, [f]);
    // The extracted quad's 4 verts are now duplicated (it shared all 4 with neighbours).
    expect(m.vertices.filter((v) => !v.removed).length).toBe(beforeVerts + 4);
    expect(validateMesh(m)).toEqual([]);
  });
});
