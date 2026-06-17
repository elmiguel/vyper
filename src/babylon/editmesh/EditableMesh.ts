import type { CustomGeometry } from '@/types';

/** A single vertex position in object space. */
export interface EditVertex {
  x: number;
  y: number;
  z: number;
}

/** A face is an ordered, CCW loop of vertex indices (triangle, quad, or n-gon). */
export type Face = number[];

/** A derived, undirected edge between two vertices and the faces that use it. */
export interface EditEdge {
  /** Lower vertex index. */
  a: number;
  /** Higher vertex index. */
  b: number;
  /** `${a}|${b}` — stable key for maps/selection. */
  key: string;
  /** Indices into `mesh.faces` of every face that contains this edge. */
  faces: number[];
}

/** The three things a user can select in Edit Mode. */
export type ComponentMode = 'vertex' | 'edge' | 'face';

const EPS = 1e-5;

/** Canonical undirected-edge key, independent of winding direction. */
export function edgeKey(a: number, b: number): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * A pragmatic, half-edge-adjacent editable polygon mesh that sits on top of the
 * engine's flat-array {@link CustomGeometry} format. Faces are kept as n-gon loops
 * (so extrude/inset produce real quads instead of triangle soup); edges are derived
 * on demand from the face loops. Vertices are *welded* — a position shared by several
 * faces is one entry, so moving it moves every connected face, which is what makes
 * box-face extrude and loop cuts behave intuitively.
 *
 * Geometry round-trips through {@link fromGeometry}/{@link toGeometry}; the operators
 * in `meshOps.ts` mutate an instance in place and report the components they created
 * so the caller (the Edit Mode controller) can keep the selection live.
 */
export class EditableMesh {
  vertices: EditVertex[] = [];
  faces: Face[] = [];

  clone(): EditableMesh {
    const m = new EditableMesh();
    m.vertices = this.vertices.map((v) => ({ x: v.x, y: v.y, z: v.z }));
    m.faces = this.faces.map((f) => f.slice());
    return m;
  }

  addVertex(x: number, y: number, z: number): number {
    return this.vertices.push({ x, y, z }) - 1;
  }

  addFace(loop: Face): number {
    return this.faces.push(loop.slice()) - 1;
  }

  /** Geometric centroid of a face's vertices. */
  faceCentroid(faceId: number): EditVertex {
    const loop = this.faces[faceId];
    const c = { x: 0, y: 0, z: 0 };
    for (const vi of loop) {
      const v = this.vertices[vi];
      c.x += v.x;
      c.y += v.y;
      c.z += v.z;
    }
    const n = loop.length || 1;
    return { x: c.x / n, y: c.y / n, z: c.z / n };
  }

  /** Newell's-method face normal (robust for non-planar n-gons), normalized. */
  faceNormal(faceId: number): EditVertex {
    const loop = this.faces[faceId];
    let nx = 0;
    let ny = 0;
    let nz = 0;
    for (let i = 0; i < loop.length; i++) {
      const cur = this.vertices[loop[i]];
      const nxt = this.vertices[loop[(i + 1) % loop.length]];
      nx += (cur.y - nxt.y) * (cur.z + nxt.z);
      ny += (cur.z - nxt.z) * (cur.x + nxt.x);
      nz += (cur.x - nxt.x) * (cur.y + nxt.y);
    }
    const len = Math.hypot(nx, ny, nz) || 1;
    return { x: nx / len, y: ny / len, z: nz / len };
  }

  /** Build the derived edge table from the current face loops. */
  computeEdges(): Map<string, EditEdge> {
    const edges = new Map<string, EditEdge>();
    this.faces.forEach((loop, faceId) => {
      for (let i = 0; i < loop.length; i++) {
        const va = loop[i];
        const vb = loop[(i + 1) % loop.length];
        if (va === vb) continue;
        const key = edgeKey(va, vb);
        let e = edges.get(key);
        if (!e) {
          e = { a: Math.min(va, vb), b: Math.max(va, vb), key, faces: [] };
          edges.set(key, e);
        }
        if (!e.faces.includes(faceId)) e.faces.push(faceId);
      }
    });
    return edges;
  }

  /** Area-weighted smooth normal per vertex (parallel to `vertices`), for sculpting. */
  vertexNormals(): EditVertex[] {
    const normals = this.vertices.map(() => ({ x: 0, y: 0, z: 0 }));
    this.faces.forEach((_, faceId) => {
      const n = this.faceNormal(faceId);
      for (const vi of this.faces[faceId]) {
        normals[vi].x += n.x;
        normals[vi].y += n.y;
        normals[vi].z += n.z;
      }
    });
    for (const n of normals) {
      const len = Math.hypot(n.x, n.y, n.z) || 1;
      n.x /= len;
      n.y /= len;
      n.z /= len;
    }
    return normals;
  }

  /** Adjacency list: for each vertex, the set of vertices sharing an edge with it. */
  vertexAdjacency(): number[][] {
    const adj: Set<number>[] = this.vertices.map(() => new Set<number>());
    for (const e of this.computeEdges().values()) {
      adj[e.a].add(e.b);
      adj[e.b].add(e.a);
    }
    return adj.map((s) => [...s]);
  }

  /** Face indices that touch a given vertex. */
  facesAtVertex(vid: number): number[] {
    const out: number[] = [];
    this.faces.forEach((loop, i) => {
      if (loop.includes(vid)) out.push(i);
    });
    return out;
  }

  /** Move a set of vertices by a delta. */
  translateVertices(ids: Iterable<number>, dx: number, dy: number, dz: number): void {
    for (const id of ids) {
      const v = this.vertices[id];
      if (!v) continue;
      v.x += dx;
      v.y += dy;
      v.z += dz;
    }
  }

  /** Delete faces by id; leaves vertices in place (call {@link compact} to prune). */
  deleteFaces(ids: Iterable<number>): void {
    const drop = new Set(ids);
    this.faces = this.faces.filter((_, i) => !drop.has(i));
  }

  /**
   * Weld a set of vertices into their shared centroid (Blender's "Merge → At Center").
   * The lowest index survives; faces are remapped and any face that collapses to fewer
   * than three distinct vertices is removed.
   */
  mergeVertices(ids: Iterable<number>): number | null {
    const list = [...new Set(ids)].sort((p, q) => p - q);
    if (list.length < 2) return list[0] ?? null;
    const survivor = list[0];
    const c = { x: 0, y: 0, z: 0 };
    for (const id of list) {
      c.x += this.vertices[id].x;
      c.y += this.vertices[id].y;
      c.z += this.vertices[id].z;
    }
    this.vertices[survivor] = { x: c.x / list.length, y: c.y / list.length, z: c.z / list.length };
    const remap = new Set(list.slice(1));
    this.faces = this.faces
      .map((loop) => dedupeLoop(loop.map((vi) => (remap.has(vi) ? survivor : vi))))
      .filter((loop) => loop.length >= 3);
    return survivor;
  }

  /** Weld vertices that share a position within `eps`, remapping faces. */
  weldByDistance(eps = EPS): void {
    const remap = new Array(this.vertices.length);
    const kept: EditVertex[] = [];
    const buckets = new Map<string, number[]>();
    const q = (n: number) => Math.round(n / eps);
    this.vertices.forEach((v, i) => {
      const key = `${q(v.x)},${q(v.y)},${q(v.z)}`;
      const bucket = buckets.get(key);
      let match = -1;
      if (bucket) {
        for (const ki of bucket) {
          const kv = kept[ki];
          if (Math.abs(kv.x - v.x) <= eps && Math.abs(kv.y - v.y) <= eps && Math.abs(kv.z - v.z) <= eps) {
            match = ki;
            break;
          }
        }
      }
      if (match >= 0) {
        remap[i] = match;
      } else {
        const ki = kept.push({ x: v.x, y: v.y, z: v.z }) - 1;
        remap[i] = ki;
        if (bucket) bucket.push(ki);
        else buckets.set(key, [ki]);
      }
    });
    this.vertices = kept;
    this.faces = this.faces
      .map((loop) => dedupeLoop(loop.map((vi) => remap[vi])))
      .filter((loop) => loop.length >= 3);
  }

  /** Drop vertices no face references, reindexing faces. */
  compact(): void {
    const used = new Set<number>();
    for (const loop of this.faces) for (const vi of loop) used.add(vi);
    const remap = new Array(this.vertices.length).fill(-1);
    const kept: EditVertex[] = [];
    this.vertices.forEach((v, i) => {
      if (used.has(i)) {
        remap[i] = kept.push(v) - 1;
      }
    });
    this.vertices = kept;
    this.faces = this.faces.map((loop) => loop.map((vi) => remap[vi]));
  }

  /**
   * Build an editable mesh from baked geometry. If the geometry carries polygon
   * topology ({@link CustomGeometry.polygons}) it is rebuilt verbatim as quads/n-gons.
   * Otherwise the triangle soup is welded and **quadrangulated** (coplanar triangle
   * pairs merged into quads), so editing any mesh — primitives, CSG output, loaded
   * models — works in polys rather than triangles. Pass `{ quads: false }` to keep
   * raw triangles.
   */
  static fromGeometry(geo: CustomGeometry, opts: { weldEps?: number; quads?: boolean } = {}): EditableMesh {
    const m = new EditableMesh();
    // Faithful path: stored polygon topology rebuilds exact quads (no guessing).
    if (geo.polygons && geo.polyVerts) {
      for (let i = 0; i < geo.polyVerts.length; i += 3) {
        m.addVertex(geo.polyVerts[i], geo.polyVerts[i + 1], geo.polyVerts[i + 2]);
      }
      for (const loop of geo.polygons) m.addFace(loop);
      return m;
    }
    for (let i = 0; i < geo.positions.length; i += 3) {
      m.addVertex(geo.positions[i], geo.positions[i + 1], geo.positions[i + 2]);
    }
    for (let i = 0; i < geo.indices.length; i += 3) {
      m.addFace([geo.indices[i], geo.indices[i + 1], geo.indices[i + 2]]);
    }
    m.weldByDistance(opts.weldEps ?? EPS);
    if (opts.quads !== false) m.quadrangulate();
    return m;
  }

  /**
   * Merge adjacent triangle pairs into quads (tri-to-quad). Only coplanar, convex
   * pairs are merged, greedily best-first; existing quads/n-gons and lone triangles
   * (e.g. around sphere poles) are left as-is. `planarDot` is the minimum dot between
   * the two triangles' normals to treat them as coplanar (default ≈ cos 15°).
   */
  quadrangulate(planarDot = 0.965): void {
    const edges = this.computeEdges();
    const cands: Array<{ f1: number; f2: number; quad: number[]; score: number }> = [];
    for (const e of edges.values()) {
      if (e.faces.length !== 2) continue;
      const [f1, f2] = e.faces;
      if (this.faces[f1].length !== 3 || this.faces[f2].length !== 3) continue;
      const quad = mergeTriPair(this.faces[f1], this.faces[f2], e.a, e.b);
      if (!quad) continue;
      const score = quadScore(quad.map((vi) => this.vertices[vi]), planarDot);
      if (score === null) continue;
      cands.push({ f1, f2, quad, score });
    }
    cands.sort((a, b) => a.score - b.score);
    const used = new Set<number>();
    const removed = new Set<number>();
    for (const c of cands) {
      if (used.has(c.f1) || used.has(c.f2)) continue;
      used.add(c.f1);
      used.add(c.f2);
      this.faces[c.f1] = c.quad;
      removed.add(c.f2);
    }
    if (removed.size) this.faces = this.faces.filter((_, i) => !removed.has(i));
  }

  /**
   * Bake to {@link CustomGeometry}. Faces are fan-triangulated; normals are computed
   * flat per-triangle (each triangle gets unique vertices) so hard-surface edges stay
   * crisp — which is what you want for modeling. Pass `smooth: true` to share vertices
   * and emit smooth normals instead.
   */
  toGeometry(opts: { smooth?: boolean; polygons?: boolean } = {}): CustomGeometry {
    const tris = this.triangulate();
    let geo: CustomGeometry;
    if (opts.smooth) {
      const positions: number[] = [];
      for (const v of this.vertices) positions.push(v.x, v.y, v.z);
      const indices = tris.flat();
      geo = { positions, indices, normals: smoothNormals(positions, indices) };
    } else {
      const positions: number[] = [];
      const normals: number[] = [];
      const indices: number[] = [];
      for (const [ia, ib, ic] of tris) {
        const a = this.vertices[ia];
        const b = this.vertices[ib];
        const c = this.vertices[ic];
        const n = triNormal(a, b, c);
        const base = positions.length / 3;
        positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
        normals.push(n.x, n.y, n.z, n.x, n.y, n.z, n.x, n.y, n.z);
        indices.push(base, base + 1, base + 2);
      }
      geo = { positions, indices, normals };
    }
    // Persist the polygon topology so the mesh re-opens as quads, not triangle soup.
    if (opts.polygons !== false) {
      const polyVerts: number[] = [];
      for (const v of this.vertices) polyVerts.push(v.x, v.y, v.z);
      geo.polyVerts = polyVerts;
      geo.polygons = this.faces.map((f) => f.slice());
    }
    return geo;
  }

  /**
   * Permanently fan-triangulate faces in the topology (quads/n-gons → triangles).
   * With no argument every face is triangulated; pass face ids to triangulate only
   * those. Faces already triangles are left untouched. Unlike {@link triangulate}
   * (which only derives a render index list) this mutates `faces`, so the change
   * round-trips through {@link toGeometry} and persists.
   */
  triangulateFaces(faceIds?: Iterable<number>): void {
    const target = faceIds ? new Set(faceIds) : null;
    const out: Face[] = [];
    this.faces.forEach((loop, i) => {
      if (loop.length <= 3 || (target && !target.has(i))) {
        out.push(loop);
        return;
      }
      for (let k = 1; k < loop.length - 1; k++) out.push([loop[0], loop[k], loop[k + 1]]);
    });
    this.faces = out;
  }

  /** Fan-triangulate every face loop into [a,b,c] triangles. */
  triangulate(): Array<[number, number, number]> {
    const tris: Array<[number, number, number]> = [];
    for (const loop of this.faces) {
      for (let i = 1; i < loop.length - 1; i++) {
        tris.push([loop[0], loop[i], loop[i + 1]]);
      }
    }
    return tris;
  }
}

/** Remove consecutive (and wrap-around) duplicate indices from a face loop. */
function dedupeLoop(loop: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < loop.length; i++) {
    if (loop[i] !== loop[(i + 1) % loop.length]) out.push(loop[i]);
  }
  return out;
}

/**
 * Stitch two triangles sharing edge {a,b} into a quad loop. Returns the quad in CCW
 * order consistent with the triangles' winding, or null if the shared edge isn't found.
 */
function mergeTriPair(triA: number[], triB: number[], a: number, b: number): number[] | null {
  let p = -1;
  let q = -1;
  for (let i = 0; i < 3; i++) {
    const u = triA[i];
    const v = triA[(i + 1) % 3];
    if ((u === a && v === b) || (u === b && v === a)) {
      p = u;
      q = v;
      break;
    }
  }
  if (p < 0) return null;
  const cA = triA.find((v) => v !== p && v !== q);
  const cB = triB.find((v) => v !== a && v !== b);
  if (cA === undefined || cB === undefined) return null;
  // triA = [cA,p,q], triB winds q->p so contains [cB,q,p]; stitched quad is [cA,p,cB,q].
  return [cA, p, cB, q];
}

/**
 * Score a candidate quad (4 positions in loop order): lower is a better merge. Returns
 * null when the two halves aren't coplanar enough or the quad isn't convex.
 */
function quadScore(v: EditVertex[], planarDot: number): number | null {
  const [a, b, c, d] = v;
  const n1 = triNormal(a, b, c);
  const n2 = triNormal(a, c, d);
  const dot = n1.x * n2.x + n1.y * n2.y + n1.z * n2.z;
  if (dot < planarDot) return null;
  if (!isConvexQuad(v, n1)) return null;
  // Prefer flat + right-angled quads: planarity term + worst corner's deviation from 90°.
  let worst = 0;
  for (let i = 0; i < 4; i++) {
    const prev = v[(i + 3) % 4];
    const cur = v[i];
    const nxt = v[(i + 1) % 4];
    const e1 = norm({ x: prev.x - cur.x, y: prev.y - cur.y, z: prev.z - cur.z });
    const e2 = norm({ x: nxt.x - cur.x, y: nxt.y - cur.y, z: nxt.z - cur.z });
    worst = Math.max(worst, Math.abs(e1.x * e2.x + e1.y * e2.y + e1.z * e2.z));
  }
  return (1 - dot) * 5 + worst;
}

/** Convexity test: every corner turns the same way relative to the face normal. */
function isConvexQuad(v: EditVertex[], n: EditVertex): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const cur = v[i];
    const nxt = v[(i + 1) % 4];
    const nn = v[(i + 2) % 4];
    const e1 = { x: nxt.x - cur.x, y: nxt.y - cur.y, z: nxt.z - cur.z };
    const e2 = { x: nn.x - nxt.x, y: nn.y - nxt.y, z: nn.z - nxt.z };
    const cross = {
      x: e1.y * e2.z - e1.z * e2.y,
      y: e1.z * e2.x - e1.x * e2.z,
      z: e1.x * e2.y - e1.y * e2.x,
    };
    const s = cross.x * n.x + cross.y * n.y + cross.z * n.z;
    if (Math.abs(s) < 1e-9) continue;
    if (sign === 0) sign = Math.sign(s);
    else if (Math.sign(s) !== sign) return false;
  }
  return true;
}

function norm(v: EditVertex): EditVertex {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function triNormal(a: EditVertex, b: EditVertex, c: EditVertex): EditVertex {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const uz = b.z - a.z;
  const vx = c.x - a.x;
  const vy = c.y - a.y;
  const vz = c.z - a.z;
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  return { x: nx / len, y: ny / len, z: nz / len };
}

function smoothNormals(positions: number[], indices: number[]): number[] {
  const normals = new Array(positions.length).fill(0);
  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i] * 3;
    const ib = indices[i + 1] * 3;
    const ic = indices[i + 2] * 3;
    const a = { x: positions[ia], y: positions[ia + 1], z: positions[ia + 2] };
    const b = { x: positions[ib], y: positions[ib + 1], z: positions[ib + 2] };
    const c = { x: positions[ic], y: positions[ic + 1], z: positions[ic + 2] };
    const n = triNormal(a, b, c);
    for (const base of [ia, ib, ic]) {
      normals[base] += n.x;
      normals[base + 1] += n.y;
      normals[base + 2] += n.z;
    }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const len = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    normals[i] /= len;
    normals[i + 1] /= len;
    normals[i + 2] /= len;
  }
  return normals;
}
