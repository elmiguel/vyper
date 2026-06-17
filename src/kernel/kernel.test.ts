import { describe, it, expect } from 'vitest';
import { HalfEdgeMesh } from './HalfEdgeMesh';
import { buildPrimitive } from './primitives';
import { validateMesh } from './validate';
import { toGeometry, fromGeometry } from './render';
import { CommandStack, snapshotCommand } from './commands';

describe('HalfEdgeMesh.buildFromPolygons + validate', () => {
  it('builds a well-formed cube (8v / 24he / 12e / 6f)', () => {
    const m = buildPrimitive('cube', 2);
    expect(m.vertices.length).toBe(8);
    expect(m.halfEdges.length).toBe(24);
    expect(m.edges.length).toBe(12);
    expect(m.faces.length).toBe(6);
    expect(validateMesh(m)).toEqual([]);
  });

  it('makes every cube edge interior (two half-edges, mutual twins)', () => {
    const m = buildPrimitive('cube', 2);
    for (let e = 0; e < m.edges.length; e++) {
      const he = m.edges[e].halfEdge;
      expect(m.halfEdges[he].twin).toBeGreaterThanOrEqual(0);
      expect(m.halfEdges[m.halfEdges[he].twin].twin).toBe(he);
      expect(m.edgeFaces(e)).toHaveLength(2);
    }
  });

  it('reads back quad face loops', () => {
    const m = buildPrimitive('cube', 2);
    expect(m.faceVertices(0)).toHaveLength(4);
    expect(m.faceHalfEdges(0)).toHaveLength(4);
  });

  it('leaves boundary half-edges on an open plane', () => {
    const m = buildPrimitive('plane', 2); // single quad → all edges are boundaries
    expect(validateMesh(m)).toEqual([]);
    const boundaryEdges = m.liveEdges().filter((e) => m.edgeFaces(e).length === 1);
    expect(boundaryEdges).toHaveLength(4);
  });
});

describe('render adapter', () => {
  it('triangulates to render buffers + keeps polygon topology', () => {
    const m = buildPrimitive('cube', 2);
    const geo = toGeometry(m);
    expect(geo.polygons!).toHaveLength(6);
    expect(geo.polyVerts!).toHaveLength(24); // 8 verts × 3
    expect(geo.indices.length).toBe(36); // 6 quads × 2 tris × 3
    expect(geo.positions.length).toBe(geo.normals.length);
  });

  it('round-trips through polygon topology', () => {
    const m = buildPrimitive('cube', 2);
    const back = fromGeometry(toGeometry(m));
    expect(back.faces.length).toBe(6);
    expect(back.vertices.length).toBe(8);
    expect(validateMesh(back)).toEqual([]);
  });

  it('welds a triangle soup with no polygon data', () => {
    // Two triangles of a quad, with duplicated shared-edge corners.
    const geo = {
      positions: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0],
      indices: [0, 1, 2, 3, 4, 5],
      normals: [],
    };
    const m = fromGeometry(geo);
    expect(m.vertices.length).toBe(4); // welded
    expect(m.faces.length).toBe(2);
    expect(validateMesh(m)).toEqual([]);
  });
});

describe('CommandStack + snapshotCommand', () => {
  it('undoes and redoes a vertex move', () => {
    const m = buildPrimitive('cube', 2);
    const stack = new CommandStack();
    const before = m.vertices[0].position[1];
    stack.run(snapshotCommand(m, 'nudge', () => {
      m.vertices[0].position[1] += 5;
    }));
    expect(m.vertices[0].position[1]).toBe(before + 5);
    stack.undo();
    expect(m.vertices[0].position[1]).toBe(before);
    stack.redo();
    expect(m.vertices[0].position[1]).toBe(before + 5);
    expect(validateMesh(m)).toEqual([]);
  });

  it('tracks canUndo/canRedo', () => {
    const m = new HalfEdgeMesh();
    const stack = new CommandStack();
    expect(stack.canUndo()).toBe(false);
    stack.run(snapshotCommand(m, 'noop', () => {}));
    expect(stack.canUndo()).toBe(true);
    expect(stack.canRedo()).toBe(false);
    stack.undo();
    expect(stack.canRedo()).toBe(true);
  });
});

describe('validateMesh catches corruption', () => {
  it('flags a broken twin link', () => {
    const m = buildPrimitive('cube', 2);
    m.halfEdges[0].twin = 5; // 5's twin no longer points back to 0
    expect(validateMesh(m).length).toBeGreaterThan(0);
  });
});
