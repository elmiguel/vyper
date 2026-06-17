/**
 * A half-edge (doubly-connected edge list) mesh — the modeling kernel's source of truth
 * for topology. Unlike render buffers (positions/indices), the half-edge structure makes
 * adjacency O(1): every directed half-edge knows its `twin`, `next`, `prev`, owning
 * `face`, and target `vertex`, so operations like extrude, bevel, loop cut, dissolve and
 * bridge are expressible as local pointer surgery rather than global rebuilds.
 *
 * Faces are kept as n-gons (Maya/Blender-style); triangulation happens only when
 * extracting render buffers (see render.ts). Ids are array indices; removed elements are
 * tombstoned (`removed: true`) and dropped on {@link compact}. Topology round-trips
 * through {@link serialize}/{@link deserialize} for snapshot-based undo (see commands.ts).
 */

export type V3 = [number, number, number];

export interface HEVertex {
  position: V3;
  /** An outgoing half-edge (origin === this vertex), or -1 if isolated. */
  halfEdge: number;
  removed?: boolean;
}

export interface HalfEdge {
  /** Target vertex (the vertex this half-edge points at). */
  vertex: number;
  /** Opposite half-edge (origin/target swapped), or -1 on a boundary. */
  twin: number;
  next: number;
  prev: number;
  edge: number;
  /** Owning face, or -1 for a boundary half-edge. */
  face: number;
  removed?: boolean;
}

export interface HEEdge {
  halfEdge: number;
  removed?: boolean;
}

export interface HEFace {
  halfEdge: number;
  removed?: boolean;
}

export interface SerializedHE {
  vertices: HEVertex[];
  halfEdges: HalfEdge[];
  edges: HEEdge[];
  faces: HEFace[];
}

export class HalfEdgeMesh {
  vertices: HEVertex[] = [];
  halfEdges: HalfEdge[] = [];
  edges: HEEdge[] = [];
  faces: HEFace[] = [];

  // ---- construction --------------------------------------------------------

  addVertex(position: V3): number {
    return this.vertices.push({ position, halfEdge: -1 }) - 1;
  }

  /**
   * Build the mesh from a polygon soup: vertex positions + faces (each an ordered,
   * CCW loop of vertex indices). Half-edges are created per face edge, linked into face
   * loops, then paired into twins/edges by matching opposite directed edges. Replaces any
   * existing topology.
   */
  buildFromPolygons(positions: V3[], faces: number[][]): this {
    this.vertices = positions.map((p) => ({ position: [p[0], p[1], p[2]] as V3, halfEdge: -1 }));
    this.halfEdges = [];
    this.edges = [];
    this.faces = [];
    const origin: number[] = []; // origin vertex per half-edge (by he id)
    const byDirected = new Map<string, number>(); // `${origin}_${target}` -> he id

    for (const loop of faces) {
      if (loop.length < 3) continue;
      const faceId = this.faces.push({ halfEdge: -1 }) - 1;
      const ids: number[] = [];
      for (let i = 0; i < loop.length; i++) {
        const o = loop[i];
        const t = loop[(i + 1) % loop.length];
        const he = this.halfEdges.push({ vertex: t, twin: -1, next: -1, prev: -1, edge: -1, face: faceId }) - 1;
        origin[he] = o;
        ids.push(he);
        byDirected.set(`${o}_${t}`, he);
        if (this.vertices[o].halfEdge === -1) this.vertices[o].halfEdge = he;
      }
      // Link the face loop (next/prev) and point the face at its first half-edge.
      for (let i = 0; i < ids.length; i++) {
        const he = ids[i];
        this.halfEdges[he].next = ids[(i + 1) % ids.length];
        this.halfEdges[he].prev = ids[(i - 1 + ids.length) % ids.length];
      }
      this.faces[faceId].halfEdge = ids[0];
    }

    // Pair twins + assign shared edges.
    for (let he = 0; he < this.halfEdges.length; he++) {
      if (this.halfEdges[he].edge !== -1) continue; // already paired
      const o = origin[he];
      const t = this.halfEdges[he].vertex;
      const twin = byDirected.get(`${t}_${o}`);
      const edgeId = this.edges.push({ halfEdge: he }) - 1;
      this.halfEdges[he].edge = edgeId;
      if (twin !== undefined) {
        this.halfEdges[he].twin = twin;
        this.halfEdges[twin].twin = he;
        this.halfEdges[twin].edge = edgeId;
      }
    }
    return this;
  }

  // ---- traversal -----------------------------------------------------------

  /** Origin vertex of a half-edge (target of its prev). */
  originOf(he: number): number {
    return this.halfEdges[this.halfEdges[he].prev].vertex;
  }

  /** Vertex indices around a face, in loop order (origins of each half-edge). */
  faceVertices(faceId: number): number[] {
    const start = this.faces[faceId].halfEdge;
    const out: number[] = [];
    let he = start;
    do {
      out.push(this.originOf(he));
      he = this.halfEdges[he].next;
    } while (he !== start && he !== -1 && out.length <= this.halfEdges.length);
    return out;
  }

  /** Half-edge ids around a face, in loop order. */
  faceHalfEdges(faceId: number): number[] {
    const start = this.faces[faceId].halfEdge;
    const out: number[] = [];
    let he = start;
    do {
      out.push(he);
      he = this.halfEdges[he].next;
    } while (he !== start && he !== -1 && out.length <= this.halfEdges.length);
    return out;
  }

  /**
   * The connected component ("island") of faces reachable from `faceId` across shared
   * edges. Distinct objects added to the model are separate islands (no shared edges),
   * so this is how an object-mode click selects just the clicked object.
   */
  faceIsland(faceId: number): number[] {
    if (!this.faces[faceId] || this.faces[faceId].removed) return [];
    const seen = new Set<number>([faceId]);
    const queue = [faceId];
    while (queue.length) {
      const f = queue.pop()!;
      for (const he of this.faceHalfEdges(f)) {
        const twin = this.halfEdges[he].twin;
        if (twin === -1) continue;
        const nf = this.halfEdges[twin].face;
        if (nf !== -1 && !this.faces[nf]?.removed && !seen.has(nf)) {
          seen.add(nf);
          queue.push(nf);
        }
      }
    }
    return [...seen];
  }

  /** The two endpoint vertices of an edge. */
  edgeVertices(edgeId: number): [number, number] {
    const he = this.edges[edgeId].halfEdge;
    return [this.originOf(he), this.halfEdges[he].vertex];
  }

  /** Faces adjacent to an edge (1 for a boundary, 2 otherwise). */
  edgeFaces(edgeId: number): number[] {
    const he = this.edges[edgeId].halfEdge;
    const out = [this.halfEdges[he].face];
    const twin = this.halfEdges[he].twin;
    if (twin !== -1 && this.halfEdges[twin].face !== -1) out.push(this.halfEdges[twin].face);
    return out.filter((f) => f !== -1);
  }

  /** Live (non-removed) face ids. */
  liveFaces(): number[] {
    const out: number[] = [];
    this.faces.forEach((f, i) => {
      if (!f.removed) out.push(i);
    });
    return out;
  }

  liveEdges(): number[] {
    const out: number[] = [];
    this.edges.forEach((e, i) => {
      if (!e.removed) out.push(i);
    });
    return out;
  }

  // ---- snapshot (for command-based undo) -----------------------------------

  serialize(): SerializedHE {
    return {
      vertices: this.vertices.map((v) => ({ position: [...v.position] as V3, halfEdge: v.halfEdge, removed: v.removed })),
      halfEdges: this.halfEdges.map((h) => ({ ...h })),
      edges: this.edges.map((e) => ({ ...e })),
      faces: this.faces.map((f) => ({ ...f })),
    };
  }

  deserialize(s: SerializedHE): this {
    this.vertices = s.vertices.map((v) => ({ position: [...v.position] as V3, halfEdge: v.halfEdge, removed: v.removed }));
    this.halfEdges = s.halfEdges.map((h) => ({ ...h }));
    this.edges = s.edges.map((e) => ({ ...e }));
    this.faces = s.faces.map((f) => ({ ...f }));
    return this;
  }

  clone(): HalfEdgeMesh {
    return new HalfEdgeMesh().deserialize(this.serialize());
  }
}
