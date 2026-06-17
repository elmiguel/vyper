import { HalfEdgeMesh } from './HalfEdgeMesh';

/**
 * Validate a half-edge mesh's topological invariants — run this after every operation
 * (cheap in dev) to catch broken pointer surgery early, per the kernel guidance. Returns
 * a list of human-readable problems; an empty list means the mesh is well-formed.
 */
export function validateMesh(mesh: HalfEdgeMesh): string[] {
  const problems: string[] = [];
  const { halfEdges, edges, faces, vertices } = mesh;

  halfEdges.forEach((he, i) => {
    if (he.removed) return;
    // next/prev are mutual inverses
    if (halfEdges[he.next]?.prev !== i) problems.push(`he ${i}: next.prev !== self`);
    if (halfEdges[he.prev]?.next !== i) problems.push(`he ${i}: prev.next !== self`);
    // twin symmetry
    if (he.twin !== -1) {
      if (halfEdges[he.twin]?.twin !== i) problems.push(`he ${i}: twin.twin !== self`);
      if (halfEdges[he.twin]?.edge !== he.edge) problems.push(`he ${i}: twin on a different edge`);
    }
    // edge back-reference exists
    if (he.edge === -1 || edges[he.edge]?.removed) problems.push(`he ${i}: dangling edge ref`);
    // a half-edge must not be its own twin/next
    if (he.twin === i) problems.push(`he ${i}: twin === self`);
    if (he.next === i) problems.push(`he ${i}: next === self`);
  });

  // Face loops are closed and ≥3 sided.
  for (const f of mesh.liveFaces()) {
    const start = faces[f].halfEdge;
    let he = start;
    let n = 0;
    do {
      if (halfEdges[he]?.face !== f) {
        problems.push(`face ${f}: half-edge ${he} not owned by face`);
        break;
      }
      he = halfEdges[he].next;
      if (++n > halfEdges.length) {
        problems.push(`face ${f}: loop does not close`);
        break;
      }
    } while (he !== start);
    if (n < 3) problems.push(`face ${f}: fewer than 3 sides`);
  }

  // Each edge is referenced by 1 (boundary) or 2 (interior) half-edges.
  for (const e of mesh.liveEdges()) {
    const refs = halfEdges.filter((h) => !h.removed && h.edge === e).length;
    if (refs < 1 || refs > 2) problems.push(`edge ${e}: referenced by ${refs} half-edges`);
  }

  // Vertex back-reference (its half-edge originates at it), and finite positions.
  vertices.forEach((v, i) => {
    if (v.removed) return;
    if (!v.position.every((c) => Number.isFinite(c))) problems.push(`vertex ${i}: non-finite position`);
    if (v.halfEdge !== -1 && !halfEdges[v.halfEdge]?.removed && mesh.originOf(v.halfEdge) !== i) {
      problems.push(`vertex ${i}: halfEdge does not originate here`);
    }
  });

  return problems;
}

/** Throw if the mesh is invalid — handy in tests and dev assertions. */
export function assertValid(mesh: HalfEdgeMesh): void {
  const problems = validateMesh(mesh);
  if (problems.length) throw new Error(`Invalid half-edge mesh:\n  ${problems.join('\n  ')}`);
}
