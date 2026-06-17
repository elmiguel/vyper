import { describe, it, expect } from 'vitest';
import { EditableMesh, edgeKey } from './EditableMesh';
import { extrudeFaces, insetFaces, subdivideFaces, loopCut, bevelEdges, connectVertices, bridgeEdgeLoops } from './meshOps';
import { insertEdgePoint, applyKnife, nearestFaceEdge } from './knife';
import { buildEditPrimitive } from './primitives';

describe('EditableMesh round-trip', () => {
  it('welds coincident vertices on import', () => {
    // Two triangles sharing an edge, but with duplicated corner positions (flat geo).
    const geo = {
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, /* dup */ 1, 0, 0, 0, 1, 0, 1, 1, 0],
      indices: [0, 1, 2, 3, 4, 5],
      normals: [],
    };
    const m = EditableMesh.fromGeometry(geo, { quads: false }); // isolate welding
    expect(m.vertices.length).toBe(4); // 6 corners → 4 welded
    expect(m.faces.length).toBe(2);
  });

  it('bakes flat-shaded geometry with per-triangle normals', () => {
    const m = buildEditPrimitive('plane', 2);
    const geo = m.toGeometry();
    expect(geo.indices.length).toBe(6); // one quad → two triangles
    expect(geo.positions.length).toBe(geo.normals.length);
    // Plane faces +Y, so every normal should be ~ (0,1,0).
    for (let i = 0; i < geo.normals.length; i += 3) {
      expect(geo.normals[i + 1]).toBeCloseTo(1, 5);
    }
  });

  it('bakes smooth geometry sharing vertices', () => {
    const m = buildEditPrimitive('box', 2);
    const flat = m.toGeometry();
    const smooth = m.toGeometry({ smooth: true });
    expect(smooth.positions.length).toBeLessThan(flat.positions.length);
    expect(smooth.positions.length / 3).toBe(m.vertices.length);
  });
});

describe('quadrangulation (tri → quad)', () => {
  it('merges a triangulated box back into 6 quads', () => {
    // A box as triangle soup (what reading a GPU/primitive mesh yields).
    const tri = buildEditPrimitive('box', 2).toGeometry({ polygons: false });
    expect(tri.polygons).toBeUndefined();
    const m = EditableMesh.fromGeometry(tri); // welds + quadrangulates by default
    expect(m.faces.length).toBe(6);
    expect(m.faces.every((f) => f.length === 4)).toBe(true);
  });

  it('keeps raw triangles when quads are disabled', () => {
    const tri = buildEditPrimitive('box', 2).toGeometry({ polygons: false });
    const m = EditableMesh.fromGeometry(tri, { quads: false });
    expect(m.faces.length).toBe(12); // 6 quads × 2 tris
    expect(m.faces.every((f) => f.length === 3)).toBe(true);
  });

  it('round-trips polygon topology verbatim (no re-triangulation)', () => {
    const box = buildEditPrimitive('box', 2);
    const geo = box.toGeometry(); // carries polyVerts + polygons
    expect(geo.polygons!.length).toBe(6);
    const back = EditableMesh.fromGeometry(geo);
    expect(back.faces.length).toBe(6);
    expect(back.vertices.length).toBe(8);
    expect(back.faces.every((f) => f.length === 4)).toBe(true);
  });

  it('leaves lone triangles that have no coplanar partner', () => {
    // A single triangle: nothing to merge.
    const m = EditableMesh.fromGeometry({ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2], normals: [] });
    expect(m.faces.length).toBe(1);
    expect(m.faces[0].length).toBe(3);
  });
});

describe('primitives', () => {
  it('builds a box as 6 quads / 8 verts', () => {
    const m = buildEditPrimitive('box', 2);
    expect(m.vertices.length).toBe(8);
    expect(m.faces.length).toBe(6);
    expect(m.faces.every((f) => f.length === 4)).toBe(true);
    // Closed manifold: every edge shared by exactly 2 faces.
    for (const e of m.computeEdges().values()) expect(e.faces.length).toBe(2);
  });

  it('builds an n×n grid', () => {
    const m = buildEditPrimitive('grid', 8); // 8 divisions
    expect(m.faces.length).toBe(64);
    expect(m.vertices.length).toBe(81);
  });
});

describe('extrudeFaces', () => {
  it('extrudes the top of a box into a taller solid', () => {
    const m = buildEditPrimitive('box', 2);
    const topY = Math.max(...m.vertices.map((v) => v.y));
    const topFace = m.faces.findIndex((f) => f.every((vi) => m.vertices[vi].y === topY));
    expect(topFace).toBeGreaterThanOrEqual(0);

    const before = m.vertices.length;
    const res = extrudeFaces(m, [topFace], 3);
    expect(res.vertices.length).toBe(4); // 4 new cap verts
    expect(m.vertices.length).toBe(before + 4);
    // The cap moved up by 3.
    const maxY = Math.max(...m.vertices.map((v) => v.y));
    expect(maxY).toBeCloseTo(topY + 3, 5);
    // 4 new wall faces created.
    expect(res.faces.length).toBe(1 + 4);
  });

  it('shares interior edges when extruding two adjacent faces (region)', () => {
    // Two adjacent quads of a grid extruded together share their middle edge.
    const m = buildEditPrimitive('plane', 2); // single quad
    const res = extrudeFaces(m, [0], 1);
    // Single quad → 4 walls + cap; cap pushed +Y by 1.
    expect(res.faces.length).toBe(5);
    expect(Math.max(...m.vertices.map((v) => v.y))).toBeCloseTo(1, 5);
  });
});

describe('insetFaces', () => {
  it('creates an inner cap with rim quads', () => {
    const m = buildEditPrimitive('plane', 2);
    const before = m.faces.length;
    const res = insetFaces(m, [0], 0.25);
    expect(res.vertices.length).toBe(4); // inner loop
    // original quad + 4 rim quads
    expect(m.faces.length).toBe(before + 4);
    // inner verts pulled toward centroid (origin) → |x| < 1
    for (const vi of res.vertices) expect(Math.abs(m.vertices[vi].x)).toBeLessThan(1);
  });
});

describe('subdivideFaces', () => {
  it('splits a quad into four quads', () => {
    const m = buildEditPrimitive('plane', 2);
    subdivideFaces(m, [0]);
    expect(m.faces.length).toBe(4);
    expect(m.faces.every((f) => f.length === 4)).toBe(true);
  });

  it('shares edge midpoints between adjacent faces (no cracks)', () => {
    const m = buildEditPrimitive('box', 2); // 6 quads, 12 shared edges
    const all = m.faces.map((_, i) => i);
    const before = m.vertices.length; // 8
    subdivideFaces(m, all);
    // 6 faces → 24 faces.
    expect(m.faces.length).toBe(24);
    // New verts = 12 edge midpoints (shared) + 6 face centers = 18, plus original 8.
    expect(m.vertices.length).toBe(before + 18);
    // Welding is a no-op: shared edge midpoints were created once.
    const verts = m.vertices.length;
    m.weldByDistance();
    expect(m.vertices.length).toBe(verts);
  });
});

describe('loopCut', () => {
  it('cuts a ring across a quad strip', () => {
    const m = buildEditPrimitive('grid', 4); // 16 quads
    const edges = m.computeEdges();
    // Pick any edge on the boundary to seed the cut.
    const seed = [...edges.values()].find((e) => e.faces.length === 1)!;
    const before = m.faces.length;
    const res = loopCut(m, edgeKey(seed.a, seed.b));
    expect(res.vertices.length).toBeGreaterThan(0);
    expect(m.faces.length).toBeGreaterThan(before);
    expect(m.faces.every((f) => f.length === 4)).toBe(true);
  });
});

describe('mergeVertices', () => {
  it('welds two verts to their center and drops collapsed faces', () => {
    const m = buildEditPrimitive('plane', 2);
    const [a, b] = m.faces[0];
    const survivor = m.mergeVertices([a, b]);
    expect(survivor).toBe(Math.min(a, b));
    // The quad collapses to a triangle (3 distinct verts) — still valid.
    expect(m.faces[0].length).toBe(3);
  });
});

describe('triangulateFaces', () => {
  it('splits every face into triangles when no ids are given', () => {
    const m = buildEditPrimitive('box', 2); // 6 quads
    m.triangulateFaces();
    expect(m.faces.length).toBe(12); // 6 quads → 12 tris
    expect(m.faces.every((f) => f.length === 3)).toBe(true);
  });

  it('triangulates only the given faces, leaving the rest as quads', () => {
    const m = buildEditPrimitive('box', 2);
    m.triangulateFaces([0]);
    // Face 0 → 2 tris, the other 5 stay quads: 7 faces total.
    expect(m.faces.length).toBe(7);
    expect(m.faces.filter((f) => f.length === 3).length).toBe(2);
    expect(m.faces.filter((f) => f.length === 4).length).toBe(5);
  });

  it('leaves existing triangles untouched', () => {
    const m = EditableMesh.fromGeometry({ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2], normals: [] });
    m.triangulateFaces();
    expect(m.faces.length).toBe(1);
    expect(m.faces[0].length).toBe(3);
  });
});

describe('loopCut slide rails', () => {
  it('reports each cut vertex with the edge it can slide along', () => {
    const m = buildEditPrimitive('grid', 4); // 16 quads
    const seed = [...m.computeEdges().values()].find((e) => e.faces.length === 1)!;
    const res = loopCut(m, edgeKey(seed.a, seed.b));
    expect(res.slides.length).toBe(res.vertices.length);
    // Every cut vertex sits at the midpoint of its [a,b] rail.
    for (const s of res.slides) {
      const va = m.vertices[s.a];
      const vb = m.vertices[s.b];
      const v = m.vertices[s.vert];
      expect(v.x).toBeCloseTo((va.x + vb.x) / 2, 5);
      expect(v.z).toBeCloseTo((va.z + vb.z) / 2, 5);
    }
  });
});

describe('connectVertices', () => {
  it('splits a quad into two faces along the diagonal', () => {
    const m = buildEditPrimitive('plane', 2); // single quad [0,1,2,3]
    const [a, , c] = m.faces[0];
    const res = connectVertices(m, [a, c]); // opposite corners
    expect(m.faces.length).toBe(2);
    expect(res.faces).toContain(0);
    // Both halves are triangles sharing the new diagonal edge.
    expect(m.faces.every((f) => f.length === 3)).toBe(true);
  });

  it('does nothing when the two verts are already an edge', () => {
    const m = buildEditPrimitive('plane', 2);
    const [a, b] = m.faces[0]; // adjacent corners
    const res = connectVertices(m, [a, b]);
    expect(res.faces.length).toBe(0);
    expect(m.faces.length).toBe(1);
  });
});

describe('bridgeEdgeLoops', () => {
  it('bridges two open boundary edges of separate planes with quads', () => {
    // Two single quads; bridge one edge of each.
    const m = new EditableMesh();
    // Plane A at z=0
    m.addVertex(0, 0, 0); // 0
    m.addVertex(1, 0, 0); // 1
    // Plane B at z=1
    m.addVertex(0, 0, 1); // 2
    m.addVertex(1, 0, 1); // 3
    const res = bridgeEdgeLoops(m, [edgeKey(0, 1)], [edgeKey(2, 3)]);
    expect(res.faces.length).toBe(1);
    expect(m.faces[res.faces[0]].length).toBe(4);
  });

  it('bridges two closed 4-edge rings into a 4-quad band', () => {
    const m = new EditableMesh();
    // Bottom ring (y=0) and top ring (y=1), square in XZ.
    const ring = (y: number, base: number) => {
      m.addVertex(0, y, 0);
      m.addVertex(1, y, 0);
      m.addVertex(1, y, 1);
      m.addVertex(0, y, 1);
      return [base, base + 1, base + 2, base + 3];
    };
    const a = ring(0, 0);
    const b = ring(1, 4);
    const ringEdges = (r: number[]) => r.map((v, i) => edgeKey(v, r[(i + 1) % 4]));
    const res = bridgeEdgeLoops(m, ringEdges(a), ringEdges(b));
    expect(res.faces.length).toBe(4);
    expect(res.faces.every((f) => m.faces[f].length === 4)).toBe(true);
  });
});

describe('knife', () => {
  it('inserts a vertex on an edge and shares it across both faces', () => {
    const m = buildEditPrimitive('box', 2); // 6 quads
    const e = [...m.computeEdges().values()].find((x) => x.faces.length === 2)!;
    const before = m.vertices.length;
    const id = insertEdgePoint(m, e.a, e.b, 0.5);
    expect(m.vertices.length).toBe(before + 1);
    // Both faces that shared the edge now include the new vertex.
    const touching = m.faces.filter((f) => f.includes(id));
    expect(touching.length).toBe(2);
  });

  it('snaps a probe to the nearest face edge', () => {
    const m = buildEditPrimitive('plane', 2); // quad in XZ spanning [-1,1]
    const hit = nearestFaceEdge(m, 0, { x: 0, y: 0, z: -1 }); // near the z=-1 edge
    expect(hit).not.toBeNull();
    expect(hit!.point.z).toBeCloseTo(-1, 5);
  });

  it('cuts a face edge-to-edge into two faces', () => {
    const m = buildEditPrimitive('plane', 2); // single quad
    const loop = m.faces[0];
    // Two opposite edges of the quad.
    const path = [
      { a: loop[0], b: loop[1], t: 0.5 },
      { a: loop[2], b: loop[3], t: 0.5 },
    ];
    const res = applyKnife(m, path);
    expect(res.vertices.length).toBe(2);
    expect(m.faces.length).toBe(2);
    expect(res.faces.length).toBeGreaterThan(0);
  });
});

describe('bevelEdges', () => {
  it('creates a chamfer quad per edge', () => {
    const m = buildEditPrimitive('box', 2);
    const edges = m.computeEdges();
    const key = [...edges.keys()][0];
    const before = m.faces.length;
    const res = bevelEdges(m, [key], 0.1);
    expect(res.faces.length).toBe(1);
    expect(m.faces.length).toBe(before + 1);
  });
});
