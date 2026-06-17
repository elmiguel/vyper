import { HalfEdgeMesh, type V3 } from './HalfEdgeMesh';

/** Primitive kernel meshes with clean quad topology to model against. */
export type KernelPrimitive = 'cube' | 'plane' | 'grid' | 'cylinder' | 'sphere' | 'cone' | 'torus';

export function buildPrimitive(kind: KernelPrimitive, size = 2): HalfEdgeMesh {
  switch (kind) {
    case 'cube':
      return cube(size);
    case 'plane':
      return grid(size, 1);
    case 'grid':
      return grid(size, 8);
    case 'cylinder':
      return cylinder(size / 2, size, 16);
    case 'sphere':
      return sphere(size / 2, 16, 8);
    case 'cone':
      return cone(size / 2, size, 16);
    case 'torus':
      return torus(size / 2, size / 5, 16, 10);
  }
}

function cube(size: number): HalfEdgeMesh {
  const h = size / 2;
  const p: V3[] = [
    [-h, -h, -h], [h, -h, -h], [h, -h, h], [-h, -h, h],
    [-h, h, -h], [h, h, -h], [h, h, h], [-h, h, h],
  ];
  const faces = [
    [0, 1, 2, 3], // bottom (-Y)
    [4, 5, 6, 7], // top (+Y)
    [0, 1, 5, 4], // -Z
    [2, 3, 7, 6], // +Z
    [1, 2, 6, 5], // +X
    [3, 0, 4, 7], // -X
  ];
  orientOutward(p, faces);
  return new HalfEdgeMesh().buildFromPolygons(p, faces);
}

function grid(size: number, divisions: number): HalfEdgeMesh {
  const n = divisions + 1;
  const step = size / divisions;
  const start = -size / 2;
  const p: V3[] = [];
  for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) p.push([start + ix * step, 0, start + iz * step]);
  const idx = (ix: number, iz: number) => iz * n + ix;
  const faces: number[][] = [];
  for (let iz = 0; iz < divisions; iz++) {
    for (let ix = 0; ix < divisions; ix++) {
      faces.push([idx(ix, iz), idx(ix, iz + 1), idx(ix + 1, iz + 1), idx(ix + 1, iz)]);
    }
  }
  return new HalfEdgeMesh().buildFromPolygons(p, faces);
}

function cylinder(radius: number, height: number, segments: number): HalfEdgeMesh {
  const hy = height / 2;
  const p: V3[] = [];
  const bottom: number[] = [];
  const top: number[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;
    bottom.push(p.push([x, -hy, z]) - 1);
    top.push(p.push([x, hy, z]) - 1);
  }
  const faces: number[][] = [];
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments;
    faces.push([bottom[i], bottom[j], top[j], top[i]]);
  }
  faces.push([...bottom]);
  faces.push([...top]);
  orientOutward(p, faces);
  return new HalfEdgeMesh().buildFromPolygons(p, faces);
}

/** UV sphere: quad bands between latitude rings, triangle fans at the two poles. */
function sphere(radius: number, segments: number, rings: number): HalfEdgeMesh {
  const p: V3[] = [];
  const top = p.push([0, radius, 0]) - 1;
  const bottom = p.push([0, -radius, 0]) - 1;
  const ring: number[][] = [];
  for (let r = 1; r < rings; r++) {
    const phi = (r / rings) * Math.PI; // 0..π from top
    const y = Math.cos(phi) * radius;
    const rad = Math.sin(phi) * radius;
    const row: number[] = [];
    for (let s = 0; s < segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      row.push(p.push([Math.cos(a) * rad, y, Math.sin(a) * rad]) - 1);
    }
    ring.push(row);
  }
  const faces: number[][] = [];
  for (let s = 0; s < segments; s++) faces.push([top, ring[0][s], ring[0][(s + 1) % segments]]);
  for (let r = 0; r < ring.length - 1; r++) {
    for (let s = 0; s < segments; s++) {
      const s2 = (s + 1) % segments;
      faces.push([ring[r][s], ring[r + 1][s], ring[r + 1][s2], ring[r][s2]]);
    }
  }
  const last = ring[ring.length - 1];
  for (let s = 0; s < segments; s++) faces.push([bottom, last[(s + 1) % segments], last[s]]);
  orientOutward(p, faces);
  return new HalfEdgeMesh().buildFromPolygons(p, faces);
}

/** Cone: an n-gon base and a triangle fan up to the apex. */
function cone(radius: number, height: number, segments: number): HalfEdgeMesh {
  const hy = height / 2;
  const p: V3[] = [];
  const apex = p.push([0, hy, 0]) - 1;
  const base: number[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    base.push(p.push([Math.cos(a) * radius, -hy, Math.sin(a) * radius]) - 1);
  }
  const faces: number[][] = [];
  for (let i = 0; i < segments; i++) faces.push([apex, base[i], base[(i + 1) % segments]]);
  faces.push([...base].reverse());
  orientOutward(p, faces);
  return new HalfEdgeMesh().buildFromPolygons(p, faces);
}

/** Torus: a wrapped grid of quads (major radius R, minor radius r). */
function torus(R: number, r: number, segU: number, segV: number): HalfEdgeMesh {
  const p: V3[] = [];
  const idx = (u: number, v: number) => (u % segU) * segV + (v % segV);
  for (let u = 0; u < segU; u++) {
    const au = (u / segU) * Math.PI * 2;
    for (let v = 0; v < segV; v++) {
      const av = (v / segV) * Math.PI * 2;
      const cx = Math.cos(au) * (R + r * Math.cos(av));
      const cz = Math.sin(au) * (R + r * Math.cos(av));
      const cy = r * Math.sin(av);
      p.push([cx, cy, cz]);
    }
  }
  const faces: number[][] = [];
  for (let u = 0; u < segU; u++) {
    for (let v = 0; v < segV; v++) {
      faces.push([idx(u, v), idx(u + 1, v), idx(u + 1, v + 1), idx(u, v + 1)]);
    }
  }
  return new HalfEdgeMesh().buildFromPolygons(p, faces);
}

/** Flip any face loop whose normal points toward the mesh centroid, so all faces face
 *  outward. Valid for convex solids (cube, cylinder, sphere, cone); grids/torus are left alone. */
function orientOutward(verts: V3[], faces: number[][]): void {
  const c: V3 = [0, 0, 0];
  for (const v of verts) {
    c[0] += v[0];
    c[1] += v[1];
    c[2] += v[2];
  }
  const n = verts.length || 1;
  c[0] /= n;
  c[1] /= n;
  c[2] /= n;
  for (const loop of faces) {
    const fc: V3 = [0, 0, 0];
    for (const vi of loop) {
      fc[0] += verts[vi][0];
      fc[1] += verts[vi][1];
      fc[2] += verts[vi][2];
    }
    fc[0] /= loop.length;
    fc[1] /= loop.length;
    fc[2] /= loop.length;
    const nm = loopNormal(verts, loop);
    const out: V3 = [fc[0] - c[0], fc[1] - c[1], fc[2] - c[2]];
    if (nm[0] * out[0] + nm[1] * out[1] + nm[2] * out[2] < 0) loop.reverse();
  }
}

function loopNormal(verts: V3[], loop: number[]): V3 {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < loop.length; i++) {
    const a = verts[loop[i]];
    const b = verts[loop[(i + 1) % loop.length]];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}
