import { describe, it, expect } from 'vitest';
import { buildPrimitive } from './primitives';
import { growSelection, shrinkSelection, convertSelection, edgeRing, edgeLoop, faceLoop, vertexLoop, loopThroughVertices, loopThroughFaces, pathBetweenVertices, pathBetweenFaces } from './selectionOps';

/** Edge valence (incident-edge count) per vertex, for picking interior components. */
function valences(m: ReturnType<typeof buildPrimitive>): Map<number, number> {
  const val = new Map<number, number>();
  for (const e of m.liveEdges()) {
    const [a, b] = m.edgeVertices(e);
    val.set(a, (val.get(a) ?? 0) + 1);
    val.set(b, (val.get(b) ?? 0) + 1);
  }
  return val;
}

describe('grow / shrink selection', () => {
  it('grows then shrinks a face selection back', () => {
    const m = buildPrimitive('grid', 4); // grid(size,8) → 8×8 = 64 quads
    const center = m.liveFaces()[27]; // row 3, col 3 — interior
    const grown = growSelection(m, 'face', [center]);
    expect(grown.length).toBeGreaterThan(1);
    const shrunk = shrinkSelection(m, 'face', grown);
    expect(shrunk).toContain(center);
    expect(shrunk.length).toBeLessThan(grown.length);
  });

  it('grows a vertex selection to its neighbours', () => {
    const m = buildPrimitive('grid', 4);
    const v = m.liveFaces().flatMap((f) => m.faceVertices(f)).find((x, _, a) => a.filter((y) => y === x).length === 4)!;
    expect(growSelection(m, 'vertex', [v]).length).toBe(5); // center + 4 neighbours
  });
});

describe('convertSelection', () => {
  it('converts a face to its vertices and back to the face', () => {
    const m = buildPrimitive('cube', 2);
    const f = m.liveFaces()[0];
    const verts = convertSelection(m, 'face', [f], 'vertex');
    expect(verts.length).toBe(4);
    expect(convertSelection(m, 'vertex', verts, 'face')).toContain(f);
  });
});

describe('edgeRing / edgeLoop', () => {
  it('rings around a grid strip', () => {
    const m = buildPrimitive('grid', 4);
    const ring = edgeRing(m, m.liveEdges()[0]);
    expect(ring.length).toBeGreaterThan(1);
  });

  it('walks an edge loop across a grid (valence-4 interior)', () => {
    const m = buildPrimitive('grid', 4);
    const val = valences(m);
    const interior = m.liveEdges().find((e) => {
      const [a, b] = m.edgeVertices(e);
      return val.get(a) === 4 && val.get(b) === 4;
    })!;
    const loop = edgeLoop(m, interior);
    expect(loop.length).toBeGreaterThan(1);
  });

  it('rings the four parallel edges of a cube', () => {
    const m = buildPrimitive('cube', 2);
    // A cube has only valence-3 verts (loops stop), but the quad ring is the 4-edge belt.
    expect(edgeRing(m, m.liveEdges()[0]).length).toBe(4);
  });

  it('faceLoop collects the strip of faces the edge ring crosses', () => {
    const m = buildPrimitive('grid', 4);
    const loop = faceLoop(m, m.liveEdges()[0]);
    expect(loop.length).toBeGreaterThan(1);
    expect(loop.every((f) => !m.faces[f].removed)).toBe(true); // all live faces
    // The face strip matches the edge ring's span (a band across the grid).
    expect(loop.length).toBe(edgeRing(m, m.liveEdges()[0]).length - 1);
  });

  it('vertexLoop strings the vertices along an edge loop', () => {
    const m = buildPrimitive('grid', 4);
    const val = valences(m);
    const interior = m.liveEdges().find((e) => {
      const [a, b] = m.edgeVertices(e);
      return val.get(a) === 4 && val.get(b) === 4;
    })!;
    const vloop = vertexLoop(m, interior);
    // One more vertex than edges in the loop (an open chain across the grid).
    expect(vloop.length).toBe(edgeLoop(m, interior).length + 1);
  });
});

describe('loopThroughVertices / loopThroughFaces (two-anchor loops)', () => {
  it('finds the vertex loop through two adjacent verts', () => {
    const m = buildPrimitive('grid', 4);
    const val = valences(m);
    const interior = m.liveEdges().find((e) => {
      const [a, b] = m.edgeVertices(e);
      return val.get(a) === 4 && val.get(b) === 4;
    })!;
    const [a, b] = m.edgeVertices(interior);
    const loop = loopThroughVertices(m, a, b);
    expect(loop).not.toBeNull();
    expect(loop!.includes(a) && loop!.includes(b)).toBe(true);
    expect(loop!.length).toBeGreaterThan(2);
  });

  it('finds the face loop through two adjacent faces', () => {
    const m = buildPrimitive('grid', 4);
    const interior = m.liveEdges().find((e) => m.edgeFaces(e).length === 2)!;
    const [f1, f2] = m.edgeFaces(interior);
    const loop = loopThroughFaces(m, f1, f2);
    expect(loop).not.toBeNull();
    expect(loop!.includes(f1) && loop!.includes(f2)).toBe(true);
    expect(loop!.length).toBeGreaterThan(2);
  });

  it('returns null when the two anchors share no loop', () => {
    const m = buildPrimitive('grid', 4); // 9×9 verts, 8×8 faces, row-major
    expect(loopThroughVertices(m, 0, 10)).toBeNull(); // diagonal corners — no common row/col
    expect(loopThroughFaces(m, 0, 9)).toBeNull(); // diagonal faces — different strips
  });

  it('pathBetween* connects any two anchors (the fallback when no loop is shared)', () => {
    const m = buildPrimitive('grid', 4);
    const vpath = pathBetweenVertices(m, 0, 10); // diagonal corners → a stair-step chain
    expect(vpath.length).toBeGreaterThan(2);
    expect(vpath[0]).toBe(0);
    expect(vpath[vpath.length - 1]).toBe(10);
    const fpath = pathBetweenFaces(m, 0, 9); // diagonal faces → a chain across the grid
    expect(fpath.length).toBeGreaterThan(2);
    expect(fpath[0]).toBe(0);
    expect(fpath[fpath.length - 1]).toBe(9);
  });
});
