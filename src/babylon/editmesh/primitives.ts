import { EditableMesh } from './EditableMesh';

/** Primitive shapes the Modeling Studio can spawn as editable quad meshes. */
export type EditPrimitiveKind = 'box' | 'plane' | 'grid' | 'cylinder';

/**
 * Build a primitive with clean quad topology (no triangle soup) so face/edge ops
 * behave the way a modeler expects — a box is 6 quads, a plane is one quad, a grid is
 * an n×n quad lattice. Use these instead of {@link EditableMesh.fromGeometry} when
 * starting a model from scratch.
 */
export function buildEditPrimitive(kind: EditPrimitiveKind, size = 2): EditableMesh {
  switch (kind) {
    case 'box':
      return box(size);
    case 'plane':
      return grid(size, 1);
    case 'grid':
      return grid(size, 8);
    case 'cylinder':
      return cylinder(size / 2, size, 16);
  }
}

function box(size: number): EditableMesh {
  const h = size / 2;
  const m = new EditableMesh();
  // 8 corners
  const v = [
    m.addVertex(-h, -h, -h),
    m.addVertex(h, -h, -h),
    m.addVertex(h, -h, h),
    m.addVertex(-h, -h, h),
    m.addVertex(-h, h, -h),
    m.addVertex(h, h, -h),
    m.addVertex(h, h, h),
    m.addVertex(-h, h, h),
  ];
  // 6 quads; winding is normalized outward by orientOutward below.
  m.addFace([v[0], v[1], v[2], v[3]]); // bottom (-Y)
  m.addFace([v[4], v[5], v[6], v[7]]); // top (+Y)
  m.addFace([v[0], v[1], v[5], v[4]]); // -Z
  m.addFace([v[2], v[3], v[7], v[6]]); // +Z
  m.addFace([v[1], v[2], v[6], v[5]]); // +X
  m.addFace([v[3], v[0], v[4], v[7]]); // -X
  orientOutward(m);
  return m;
}

function grid(size: number, divisions: number): EditableMesh {
  const m = new EditableMesh();
  const n = divisions + 1;
  const step = size / divisions;
  const start = -size / 2;
  const idx = (ix: number, iz: number) => iz * n + ix;
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      m.addVertex(start + ix * step, 0, start + iz * step);
    }
  }
  for (let iz = 0; iz < divisions; iz++) {
    for (let ix = 0; ix < divisions; ix++) {
      // CCW when viewed from +Y
      m.addFace([idx(ix, iz), idx(ix, iz + 1), idx(ix + 1, iz + 1), idx(ix + 1, iz)]);
    }
  }
  return m;
}

function cylinder(radius: number, height: number, segments: number): EditableMesh {
  const m = new EditableMesh();
  const hy = height / 2;
  const bottom: number[] = [];
  const top: number[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;
    bottom.push(m.addVertex(x, -hy, z));
    top.push(m.addVertex(x, hy, z));
  }
  // Side quads
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments;
    m.addFace([bottom[i], bottom[j], top[j], top[i]]);
  }
  // Caps as n-gons
  m.addFace(bottom.slice());
  m.addFace(top.slice());
  orientOutward(m);
  return m;
}

/**
 * Flip any face whose normal points toward the mesh centroid so every face faces
 * out. Valid for convex solids (box, cylinder); planar grids are left alone since
 * "outward" is undefined for them.
 */
function orientOutward(m: EditableMesh): void {
  const c = { x: 0, y: 0, z: 0 };
  for (const v of m.vertices) {
    c.x += v.x;
    c.y += v.y;
    c.z += v.z;
  }
  const n = m.vertices.length || 1;
  c.x /= n;
  c.y /= n;
  c.z /= n;
  m.faces.forEach((loop, i) => {
    const normal = m.faceNormal(i);
    const fc = m.faceCentroid(i);
    const out = { x: fc.x - c.x, y: fc.y - c.y, z: fc.z - c.z };
    if (normal.x * out.x + normal.y * out.y + normal.z * out.z < 0) loop.reverse();
  });
}
