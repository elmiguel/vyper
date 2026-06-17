import { describe, it, expect } from 'vitest';
import { HalfEdgeMesh } from '../HalfEdgeMesh';
import { buildPrimitive } from '../primitives';
import { validateMesh } from '../validate';
import { connectVertices } from './connect';
import { loopCut, loopCutPreview } from './loopcut';
import { bridgeEdges } from './bridge';
import { knifeCut } from './knife';

describe('connectVertices (kernel op)', () => {
  it('splits a quad into two faces across its diagonal', () => {
    const m = buildPrimitive('plane', 2); // single quad
    const loop = m.faceVertices(m.liveFaces()[0]);
    connectVertices(m, [loop[0], loop[2]]); // opposite corners
    expect(m.liveFaces().length).toBe(2);
    expect(validateMesh(m)).toEqual([]);
  });

  it('does nothing for two already-adjacent verts', () => {
    const m = buildPrimitive('plane', 2);
    const loop = m.faceVertices(m.liveFaces()[0]);
    connectVertices(m, [loop[0], loop[1]]);
    expect(m.liveFaces().length).toBe(1);
  });
});

describe('loopCut (kernel op)', () => {
  it('cuts a single quad into two', () => {
    const m = buildPrimitive('plane', 2);
    expect(loopCut(m, m.liveEdges()[0])).toBe(true);
    expect(m.liveFaces().length).toBe(2);
    expect(validateMesh(m)).toEqual([]);
  });

  it('cuts a strip across a grid and stays valid', () => {
    const m = buildPrimitive('grid', 2); // 4 quads
    const before = m.liveFaces().length;
    expect(loopCut(m, m.liveEdges()[0])).toBe(true);
    expect(m.liveFaces().length).toBeGreaterThan(before);
    expect(validateMesh(m)).toEqual([]);
  });

  it('cuts a cube belt into clean quads (no triangulation) regardless of face winding', () => {
    const m = buildPrimitive('cube', 2); // outward-oriented faces → mixed edge directions
    // Seed on a vertical edge so the loop runs around the 4 side faces.
    const vertical = m.liveEdges().find((e) => {
      const [a, b] = m.edgeVertices(e);
      return m.vertices[a].position[1] !== m.vertices[b].position[1];
    })!;
    expect(loopCut(m, vertical)).toBe(true);
    // Every face must remain a quad — the orientation bug split them into diagonals.
    for (const f of m.liveFaces()) expect(m.faceVertices(f).length).toBe(4);
    expect(m.liveFaces().length).toBe(10); // 4 side quads → 8, + top + bottom
    expect(validateMesh(m)).toEqual([]);
  });

  it('stays all-quads for a loop cut seeded from ANY cube edge', () => {
    // Every edge orientation (vertical / top / side) must cut cleanly — the bug only showed
    // on some orientations depending on face winding.
    const probe = buildPrimitive('cube', 2);
    for (const seed of probe.liveEdges()) {
      const m = buildPrimitive('cube', 2);
      expect(loopCut(m, seed)).toBe(true);
      for (const f of m.liveFaces()) expect(m.faceVertices(f).length).toBe(4);
      expect(validateMesh(m)).toEqual([]);
      expect(m.liveFaces().length).toBe(10);
    }
  });

  it('stays valid through several consecutive loop cuts', () => {
    const m = buildPrimitive('cube', 2);
    for (let i = 0; i < 3; i++) {
      const seed = m.liveEdges()[i * 3]; // a different seed each round
      loopCut(m, seed);
      for (const f of m.liveFaces()) expect(m.faceVertices(f).length).toBe(4);
      expect(validateMesh(m)).toEqual([]);
    }
  });

  it('previews segments without mutating the mesh', () => {
    const m = buildPrimitive('grid', 2);
    const before = m.liveFaces().length;
    const segs = loopCutPreview(m, m.liveEdges()[0]);
    expect(segs.length).toBeGreaterThan(0);
    expect(m.liveFaces().length).toBe(before); // unchanged
  });

  // The cone is a triangle fan (no quads), which the quad-only walk could never cut. The
  // generalized walk pivots around the apex to lay a clean horizontal ring across the sides.
  const coneApexSpoke = (m: HalfEdgeMesh): number => {
    let apex = 0;
    m.vertices.forEach((v, i) => {
      if (!v.removed && v.position[1] > m.vertices[apex].position[1]) apex = i;
    });
    return m.liveEdges().find((e) => m.edgeVertices(e).includes(apex))!;
  };

  it('loop-cuts a cone (triangle fan) into a clean horizontal ring', () => {
    const m = buildPrimitive('cone', 2); // 16 side tris + 1 base n-gon
    const before = m.liveFaces().length;
    expect(loopCut(m, coneApexSpoke(m))).toBe(true);
    // Each side triangle splits into a triangle (apex) + a quad (rim): +16 faces.
    expect(m.liveFaces().length).toBe(before + 16);
    expect(validateMesh(m)).toEqual([]);
  });

  it('previews one ring segment per cone side face, coplanar at t=0.5', () => {
    const m = buildPrimitive('cone', 2);
    const segs = loopCutPreview(m, coneApexSpoke(m));
    expect(segs.length).toBe(16); // one per side triangle
    const ys = segs.flatMap(([a, b]) => [a[1], b[1]]);
    for (const y of ys) expect(y).toBeCloseTo(ys[0], 6); // a level (planar) ring
  });

  it('slides the cone ring along the spokes with t', () => {
    const m = buildPrimitive('cone', 2);
    const seed = coneApexSpoke(m);
    const low = loopCutPreview(m, seed, 0.25)[0][0][1];
    const high = loopCutPreview(m, seed, 0.75)[0][0][1];
    expect(low).not.toBeCloseTo(high, 3); // different heights → the ring moved
  });
});

describe('knifeCut (kernel op)', () => {
  it('cuts a quad edge-to-edge into two faces', () => {
    const m = buildPrimitive('plane', 2);
    const loop = m.faceVertices(m.liveFaces()[0]); // dense == kernel ids on a fresh plane
    const ok = knifeCut(m, [
      { a: loop[0], b: loop[1], t: 0.5 },
      { a: loop[2], b: loop[3], t: 0.5 },
    ]);
    expect(ok).toBe(true);
    expect(m.liveFaces().length).toBe(2);
    expect(validateMesh(m)).toEqual([]);
  });
});

describe('bridgeEdges (kernel op)', () => {
  it('bridges two separate quad rings with a band of quads', () => {
    const m = new HalfEdgeMesh().buildFromPolygons(
      [
        [0, 0, 0], [2, 0, 0], [2, 0, 2], [0, 0, 2], // bottom ring
        [0, 2, 0], [2, 2, 0], [2, 2, 2], [0, 2, 2], // top ring
      ],
      [
        [0, 1, 2, 3],
        [4, 5, 6, 7],
      ],
    );
    const ok = bridgeEdges(m, m.liveEdges()); // all 8 boundary edges = two rings
    expect(ok).toBe(true);
    expect(m.liveFaces().length).toBe(6); // 2 caps + 4 walls
  });
});
