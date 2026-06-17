import { describe, it, expect } from 'vitest';
import { buildPrimitive } from '../primitives';
import { validateMesh } from '../validate';
import { CommandStack, snapshotCommand } from '../commands';
import { extrudeFaces } from './extrude';

describe('extrudeFaces (kernel op)', () => {
  it('extrudes the top of a cube into a taller, still-valid solid', () => {
    const m = buildPrimitive('cube', 2);
    const topY = Math.max(...m.vertices.map((v) => v.position[1]));
    const topFace = m.liveFaces().find((f) => m.faceVertices(f).every((vi) => m.vertices[vi].position[1] === topY))!;

    const beforeVerts = m.vertices.length;
    const beforeFaces = m.faces.length;
    const cap = extrudeFaces(m, [topFace], 3);

    expect(m.vertices.length).toBe(beforeVerts + 4); // 4 new cap verts
    expect(m.faces.length).toBe(beforeFaces + 4); // 4 wall quads
    expect(Math.max(...m.vertices.map((v) => v.position[1]))).toBeCloseTo(topY + 3, 5);
    expect(cap).toHaveLength(1);
    expect(validateMesh(m)).toEqual([]); // topology stays well-formed
  });

  it('shares interior edges when extruding two adjacent faces (region)', () => {
    const m = buildPrimitive('grid', 2); // 2×2 quads share interior edges
    const before = m.vertices.length;
    extrudeFaces(m, [0, 1], 1);
    // Region extrude duplicates only the ring verts; the shared edge is not walled twice.
    expect(validateMesh(m)).toEqual([]);
    expect(m.vertices.length).toBeGreaterThan(before);
  });

  it('is undoable as a single command', () => {
    const m = buildPrimitive('cube', 2);
    const stack = new CommandStack();
    const before = m.faces.length;
    stack.run(snapshotCommand(m, 'extrude', () => extrudeFaces(m, [1], 2)));
    expect(m.faces.length).toBe(before + 4);
    stack.undo();
    expect(m.faces.length).toBe(before);
    expect(validateMesh(m)).toEqual([]);
  });
});
