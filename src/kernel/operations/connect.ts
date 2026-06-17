import { HalfEdgeMesh } from '../HalfEdgeMesh';
import { snapshotSoup, sliceLoop } from './soup';

/**
 * Connect selected vertices with new edges (Blender's "J" / Connect Vertex Path): every
 * face that contains exactly two of the selected vertices, non-adjacent in its loop, is
 * split in two along the chord between them. Faces with fewer than two — or already
 * adjacent — selected verts are untouched. Takes kernel vertex ids; rebuilds the mesh.
 */
export function connectVertices(mesh: HalfEdgeMesh, vertexIds: number[]): void {
  if (vertexIds.length < 2) return;
  const soup = snapshotSoup(mesh);
  const sel = new Set<number>();
  for (const vid of vertexIds) {
    const d = soup.remap.get(vid);
    if (d !== undefined) sel.add(d);
  }
  if (sel.size < 2) return;
  const { polygons } = soup;
  const count = polygons.length;
  for (let fid = 0; fid < count; fid++) {
    const loop = polygons[fid];
    const hits = loop.map((vi, i) => ({ vi, i })).filter((p) => sel.has(p.vi));
    if (hits.length !== 2) continue;
    const [p, q] = hits;
    const gap = Math.abs(p.i - q.i);
    if (gap === 1 || gap === loop.length - 1) continue; // already an edge
    const f1 = sliceLoop(loop, p.i, q.i);
    const f2 = sliceLoop(loop, q.i, p.i);
    if (f1.length < 3 || f2.length < 3) continue;
    polygons[fid] = f1;
    polygons.push(f2);
  }
  mesh.buildFromPolygons(soup.verts, polygons);
}
