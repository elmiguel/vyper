import type { CustomGeometry } from '@/types';
import { HalfEdgeMesh, type V3 } from './HalfEdgeMesh';

/**
 * Bridges the kernel's topology to the renderer. The half-edge mesh owns the model;
 * Babylon only ever sees the baked {@link CustomGeometry} produced here (the kernel
 * guidance's "keep render geometry separate" rule). Faces are fan-triangulated and
 * flat-shaded for crisp hard-surface edges; the polygon topology is preserved in
 * `polyVerts`/`polygons` so the mesh re-opens in the kernel as quads, not triangle soup.
 */
export function toGeometry(mesh: HalfEdgeMesh): CustomGeometry {
  // Compact live vertices to a dense index space for the render/poly arrays.
  const remap = new Map<number, number>();
  const polyVerts: number[] = [];
  mesh.vertices.forEach((v, i) => {
    if (v.removed) return;
    remap.set(i, polyVerts.length / 3);
    polyVerts.push(v.position[0], v.position[1], v.position[2]);
  });
  const polygons: number[][] = [];
  for (const f of mesh.liveFaces()) {
    polygons.push(mesh.faceVertices(f).map((vi) => remap.get(vi)!));
  }

  return { ...bakePolygons(polyVerts, polygons), polyVerts, polygons };
}

/**
 * Bake a subset of the mesh — the given kernel face ids — into its own {@link CustomGeometry},
 * re-indexing only the vertices those faces use. Used by the Modeling Studio to export a single
 * focused object (island) as a standalone asset. Removed/missing faces are skipped.
 */
export function extractFacesGeometry(mesh: HalfEdgeMesh, faceIds: Iterable<number>): CustomGeometry {
  const remap = new Map<number, number>();
  const polyVerts: number[] = [];
  const polygons: number[][] = [];
  for (const f of faceIds) {
    if (!mesh.faces[f] || mesh.faces[f].removed) continue;
    polygons.push(
      mesh.faceVertices(f).map((vi) => {
        let d = remap.get(vi);
        if (d === undefined) {
          d = polyVerts.length / 3;
          remap.set(vi, d);
          const p = mesh.vertices[vi].position;
          polyVerts.push(p[0], p[1], p[2]);
        }
        return d;
      }),
    );
  }
  return { ...bakePolygons(polyVerts, polygons), polyVerts, polygons };
}

/** Fan-triangulate welded polygons into flat-shaded render arrays (positions/normals/indices). */
function bakePolygons(polyVerts: number[], polygons: number[][]): { positions: number[]; normals: number[]; indices: number[] } {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (const loop of polygons) {
    for (let i = 1; i < loop.length - 1; i++) {
      const a = vert(polyVerts, loop[0]);
      const b = vert(polyVerts, loop[i]);
      const c = vert(polyVerts, loop[i + 1]);
      const n = triNormal(a, b, c);
      const base = positions.length / 3;
      positions.push(...a, ...b, ...c);
      normals.push(...n, ...n, ...n);
      indices.push(base, base + 1, base + 2);
    }
  }
  return { positions, normals, indices };
}

/**
 * Build a kernel mesh from baked geometry. Prefers stored polygon topology
 * (`polyVerts`/`polygons`); otherwise welds the triangle soup by position and builds
 * from triangles. The returned mesh is a fully-linked half-edge structure.
 */
export function fromGeometry(geo: CustomGeometry, weldEps = 1e-5): HalfEdgeMesh {
  const mesh = new HalfEdgeMesh();
  if (geo.polygons && geo.polyVerts) {
    const verts: V3[] = [];
    for (let i = 0; i < geo.polyVerts.length; i += 3) verts.push([geo.polyVerts[i], geo.polyVerts[i + 1], geo.polyVerts[i + 2]]);
    return mesh.buildFromPolygons(verts, geo.polygons);
  }
  // Weld coincident triangle corners so shared positions become one vertex.
  const verts: V3[] = [];
  const map = new Map<string, number>();
  const q = (n: number) => Math.round(n / weldEps);
  const indexOf = (x: number, y: number, z: number): number => {
    const key = `${q(x)},${q(y)},${q(z)}`;
    const hit = map.get(key);
    if (hit !== undefined) return hit;
    const id = verts.push([x, y, z]) - 1;
    map.set(key, id);
    return id;
  };
  const faces: number[][] = [];
  for (let i = 0; i < geo.indices.length; i += 3) {
    const a = geo.indices[i] * 3;
    const b = geo.indices[i + 1] * 3;
    const c = geo.indices[i + 2] * 3;
    faces.push([
      indexOf(geo.positions[a], geo.positions[a + 1], geo.positions[a + 2]),
      indexOf(geo.positions[b], geo.positions[b + 1], geo.positions[b + 2]),
      indexOf(geo.positions[c], geo.positions[c + 1], geo.positions[c + 2]),
    ]);
  }
  return mesh.buildFromPolygons(verts, faces);
}

function vert(arr: number[], i: number): V3 {
  return [arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]];
}

function triNormal(a: V3, b: V3, c: V3): V3 {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}
