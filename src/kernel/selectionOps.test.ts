import { describe, it, expect } from 'vitest';
import { buildPrimitive } from './primitives';
import { growSelection, shrinkSelection, convertSelection, edgeRing, edgeLoop } from './selectionOps';

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
});
