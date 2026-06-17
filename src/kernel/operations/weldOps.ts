import { HalfEdgeMesh, type V3 } from '../HalfEdgeMesh';
import { snapshotSoup, compactSoup, type Soup } from './soup';

/** Merge the given vertices (kernel ids) into their shared centroid (Maya "Merge to Center"). */
export function mergeVertices(mesh: HalfEdgeMesh, vertexIds: number[]): boolean {
  const soup = snapshotSoup(mesh);
  const dense: number[] = [];
  for (const v of vertexIds) {
    const d = soup.remap.get(v);
    if (d !== undefined) dense.push(d);
  }
  if (dense.length < 2) return false;
  weldGroup(soup, dense);
  rebuildWelded(mesh, soup, [dense]);
  return true;
}

/** Collapse the given edges (kernel ids): each edge's endpoints weld to its midpoint;
 *  connected selected edges collapse together to one point. */
export function collapseEdges(mesh: HalfEdgeMesh, edgeIds: number[]): boolean {
  const soup = snapshotSoup(mesh);
  // Union-find over dense vertices joined by the selected edges.
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    let p = parent.get(x);
    if (p === undefined) return (parent.set(x, x), x);
    while (p !== x) (x = p), (p = parent.get(x)!);
    return x;
  };
  let any = false;
  for (const e of edgeIds) {
    if (!mesh.edges[e] || mesh.edges[e].removed) continue;
    const [ka, kb] = mesh.edgeVertices(e);
    const a = soup.remap.get(ka);
    const b = soup.remap.get(kb);
    if (a === undefined || b === undefined) continue;
    parent.set(find(a), find(b));
    any = true;
  }
  if (!any) return false;
  const groups = new Map<number, number[]>();
  for (const v of parent.keys()) {
    const r = find(v);
    (groups.get(r) ?? groups.set(r, []).get(r)!).push(v);
  }
  const groupList = [...groups.values()].filter((g) => g.length >= 2);
  for (const g of groupList) weldGroup(soup, g);
  rebuildWelded(mesh, soup, groupList);
  return true;
}

/** Move each given vertex (kernel id) to the average of its edge-neighbours (Laplacian relax). */
export function averageVertices(mesh: HalfEdgeMesh, vertexIds: number[]): boolean {
  const soup = snapshotSoup(mesh);
  const sel = new Set<number>();
  for (const v of vertexIds) {
    const d = soup.remap.get(v);
    if (d !== undefined) sel.add(d);
  }
  if (sel.size === 0) return false;
  const nbr = new Map<number, Set<number>>();
  for (const loop of soup.polygons) {
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i];
      const b = loop[(i + 1) % loop.length];
      (nbr.get(a) ?? nbr.set(a, new Set()).get(a)!).add(b);
      (nbr.get(b) ?? nbr.set(b, new Set()).get(b)!).add(a);
    }
  }
  const moved = new Map<number, V3>();
  for (const d of sel) {
    const ns = [...(nbr.get(d) ?? [])];
    if (ns.length === 0) continue;
    const c: V3 = [0, 0, 0];
    for (const n of ns) {
      c[0] += soup.verts[n][0];
      c[1] += soup.verts[n][1];
      c[2] += soup.verts[n][2];
    }
    moved.set(d, [c[0] / ns.length, c[1] / ns.length, c[2] / ns.length]);
  }
  for (const [d, p] of moved) soup.verts[d] = p;
  mesh.buildFromPolygons(soup.verts, soup.polygons);
  return true;
}

// --- internal helpers -------------------------------------------------------

/** Move every dense vertex in `group` onto their centroid, then point them at the survivor
 *  (the lowest index) so subsequent compaction welds them. */
function weldGroup(soup: Soup, group: number[]): void {
  const survivor = Math.min(...group);
  const c: V3 = [0, 0, 0];
  for (const d of group) {
    c[0] += soup.verts[d][0];
    c[1] += soup.verts[d][1];
    c[2] += soup.verts[d][2];
  }
  soup.verts[survivor] = [c[0] / group.length, c[1] / group.length, c[2] / group.length];
}

/** Remap each group's members to its survivor in the loops, dedupe, drop degenerate faces. */
function rebuildWelded(mesh: HalfEdgeMesh, soup: Soup, groups: number[][]): void {
  const remap = new Map<number, number>();
  for (const g of groups) {
    const survivor = Math.min(...g);
    for (const d of g) if (d !== survivor) remap.set(d, survivor);
  }
  const polygons = soup.polygons
    .map((loop) => dedupeLoop(loop.map((vi) => remap.get(vi) ?? vi)))
    .filter((loop) => loop.length >= 3);
  const c = compactSoup(soup.verts, polygons);
  mesh.buildFromPolygons(c.verts, c.polygons);
}

/** Remove consecutive (and wrap-around) duplicate indices from a loop. */
function dedupeLoop(loop: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < loop.length; i++) {
    if (loop[i] !== loop[(i + 1) % loop.length]) out.push(loop[i]);
  }
  return out;
}
