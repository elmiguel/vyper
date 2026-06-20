import type { V3 } from '@/kernel/HalfEdgeMesh';

/** A curve in the network: a smoothed surface polyline between two nodes. `samples` includes
 *  both endpoints, which coincide with `nodes[a]` and `nodes[b]`. */
interface Curve {
  a: number;
  b: number;
  samples: V3[];
}

/** A newly-closed 4-sided patch: its node ids in loop order [n0,n1,n2,n3]. */
export type Quad4 = [number, number, number, number];

const dist = (p: V3, q: V3): number => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

/**
 * The surface curve network for sketch retopology: a graph of nodes (junctions) joined by
 * smoothed curves. As each stroke is added its endpoints snap to nearby nodes — or split a
 * crossed curve to form a T-junction — and any newly-closed 4-cycle is reported so the caller
 * can fill it with a quad patch. Pure (no Babylon); operates purely on 3D points + a world
 * snap threshold, so it's unit-testable.
 */
export class CurveNetwork {
  readonly nodes: V3[] = [];
  readonly curves: Curve[] = [];
  /** nodeId → incident {curveId, other-node}. */
  private adj: Array<Array<{ curve: number; other: number }>> = [];
  /** Cycles already filled (sorted-node-id key), so a patch isn't filled twice. */
  private readonly filled = new Set<string>();

  constructor(private readonly threshold: number) {}

  /**
   * Add a stroke (its resampled surface points). Snaps endpoints to existing nodes / splits a
   * crossed curve, inserts the curve, and returns any new 4-cycles formed (each not previously
   * filled). The returned node loops are oriented so consecutive ids are edge-adjacent.
   */
  addCurve(samples: V3[]): Quad4[] {
    if (samples.length < 2) return [];
    const a = this.snap(samples[0]);
    const b = this.snap(samples[samples.length - 1]);
    if (a === b) return []; // a closed loop on itself — not a 4-patch boundary
    const fixed = samples.slice();
    fixed[0] = this.nodes[a];
    fixed[fixed.length - 1] = this.nodes[b];
    this.link(a, b, fixed);
    return this.newCyclesThrough(a, b);
  }

  /** Samples of a curve joining nodes `from`→`to` (oriented), or null if none exists. */
  curveBetween(from: number, to: number): V3[] | null {
    for (const e of this.adj[from] ?? []) {
      if (e.other !== to) continue;
      const c = this.curves[e.curve];
      return c.a === from ? c.samples.slice() : c.samples.slice().reverse();
    }
    return null;
  }

  // --- node snapping ---------------------------------------------------------

  /** Resolve a point to a node id: nearest node within threshold, else split the nearest
   *  curve if the point lands on its interior, else a fresh node. */
  private snap(p: V3): number {
    let bestNode = -1;
    let bestD = this.threshold;
    this.nodes.forEach((n, i) => {
      const d = dist(p, n);
      if (d < bestD) {
        bestD = d;
        bestNode = i;
      }
    });
    if (bestNode >= 0) return bestNode;

    const hit = this.nearestCurvePoint(p);
    if (hit && hit.d < this.threshold) return this.splitCurve(hit.curve, hit.index);

    return this.addNode(p);
  }

  /** Nearest interior sample (not an endpoint) across all curves. */
  private nearestCurvePoint(p: V3): { curve: number; index: number; d: number } | null {
    let best: { curve: number; index: number; d: number } | null = null;
    this.curves.forEach((c, ci) => {
      for (let i = 1; i < c.samples.length - 1; i++) {
        const d = dist(p, c.samples[i]);
        if (!best || d < best.d) best = { curve: ci, index: i, d };
      }
    });
    return best;
  }

  /** Split curve `ci` at sample `index`, inserting a new node there; returns the new node id. */
  private splitCurve(ci: number, index: number): number {
    const c = this.curves[ci];
    const mid = this.addNode(c.samples[index]);
    const left = c.samples.slice(0, index + 1);
    const right = c.samples.slice(index);
    // Reuse this curve slot for a→mid; unlink its old b end and relink.
    this.unlinkEdge(ci);
    this.curves[ci] = { a: c.a, b: mid, samples: left };
    this.relinkEdge(ci);
    this.link(mid, c.b, right);
    return mid;
  }

  // --- graph plumbing --------------------------------------------------------

  private addNode(p: V3): number {
    this.nodes.push(p);
    this.adj.push([]);
    return this.nodes.length - 1;
  }

  private link(a: number, b: number, samples: V3[]): number {
    const id = this.curves.length;
    this.curves.push({ a, b, samples });
    this.adj[a].push({ curve: id, other: b });
    this.adj[b].push({ curve: id, other: a });
    return id;
  }

  private relinkEdge(ci: number): void {
    const c = this.curves[ci];
    this.adj[c.a].push({ curve: ci, other: c.b });
    this.adj[c.b].push({ curve: ci, other: c.a });
  }

  private unlinkEdge(ci: number): void {
    const c = this.curves[ci];
    this.adj[c.a] = this.adj[c.a].filter((e) => e.curve !== ci);
    this.adj[c.b] = this.adj[c.b].filter((e) => e.curve !== ci);
  }

  // --- 4-cycle detection -----------------------------------------------------

  /** New 4-cycles created by the edge a–b: simple 3-edge paths b→p→q→a (not via a–b). */
  private newCyclesThrough(a: number, b: number): Quad4[] {
    const out: Quad4[] = [];
    for (const e1 of this.adj[b]) {
      const p = e1.other;
      if (p === a || p === b) continue;
      for (const e2 of this.adj[p]) {
        const q = e2.other;
        if (q === a || q === b || q === p) continue;
        for (const e3 of this.adj[q]) {
          if (e3.other !== a) continue;
          const cycle: Quad4 = [a, b, p, q];
          const key = [...cycle].sort((x, y) => x - y).join(',');
          if (this.filled.has(key)) continue;
          this.filled.add(key);
          out.push(cycle);
        }
      }
    }
    return out;
  }
}
