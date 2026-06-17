import { describe, it, expect } from 'vitest';
import { buildEditPrimitive } from './primitives';
import { edgeKey } from './EditableMesh';
import { selectAll, growSelection, shrinkSelection, edgeRing, edgeLoop } from './selectionOps';

describe('selectAll', () => {
  it('selects every component of a box', () => {
    const m = buildEditPrimitive('box', 2);
    expect(selectAll(m, 'vertex').size).toBe(8);
    expect(selectAll(m, 'face').size).toBe(6);
    expect(selectAll(m, 'edge').size).toBe(12);
  });
});

describe('growSelection / shrinkSelection (faces)', () => {
  it('grows from one face to its edge-neighbors and shrinks back', () => {
    const m = buildEditPrimitive('box', 2); // every face neighbors the other 4 (not the opposite)
    const one = new Set(['0']);
    const grown = growSelection(m, 'face', one);
    expect(grown.size).toBe(5); // self + 4 edge-adjacent (all but the opposite face)
    // Shrinking the grown set removes the boundary faces, leaving the interior (face 0).
    const shrunk = shrinkSelection(m, 'face', grown);
    expect(shrunk.has('0')).toBe(true);
    expect(shrunk.size).toBeLessThan(grown.size);
  });
});

describe('growSelection (vertices)', () => {
  it('adds adjacent vertices', () => {
    const m = buildEditPrimitive('box', 2);
    const grown = growSelection(m, 'vertex', new Set(['0']));
    // A box corner connects to 3 edges → 3 neighbors, plus itself.
    expect(grown.size).toBe(4);
    expect(grown.has('0')).toBe(true);
  });
});

describe('edgeRing', () => {
  it('returns a ring of parallel edges around a box', () => {
    const m = buildEditPrimitive('box', 2);
    const edges = [...m.computeEdges().values()];
    const ring = edgeRing(m, edges[0].key);
    // A cube edge's ring is the 4 parallel edges encircling it.
    expect(ring.size).toBe(4);
    expect(ring.has(edges[0].key)).toBe(true);
  });
});

describe('edgeLoop', () => {
  it('walks a loop across a quad grid', () => {
    const m = buildEditPrimitive('grid', 4); // 4x4 quads, interior vertices valence-4
    const edges = [...m.computeEdges().values()];
    // Seed an interior edge; the loop should contain more than just the seed.
    const interior = edges.find((e) => e.faces.length === 2)!;
    const loop = edgeLoop(m, edgeKey(interior.a, interior.b));
    expect(loop.size).toBeGreaterThan(1);
  });

  it('handles a seed with no regular continuation gracefully', () => {
    const m = buildEditPrimitive('plane', 2); // single quad, all valence-2 corners
    const edges = [...m.computeEdges().values()];
    const loop = edgeLoop(m, edges[0].key);
    expect(loop.has(edges[0].key)).toBe(true);
  });
});
