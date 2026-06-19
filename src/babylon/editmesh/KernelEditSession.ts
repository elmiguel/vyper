import { HalfEdgeMesh, type V3 } from '@/kernel/HalfEdgeMesh';
import { toGeometry, fromGeometry } from '@/kernel/render';
import { extrudeFaces } from '@/kernel/operations/extrude';
import { deleteFaces, dissolveEdges, dissolveVertices, duplicateFaces } from '@/kernel/operations/editOps';
import { connectVertices } from '@/kernel/operations/connect';
import { bridgeEdges } from '@/kernel/operations/bridge';
import { loopCut } from '@/kernel/operations/loopcut';
import { knifeCut, type KnifePoint } from '@/kernel/operations/knife';
import { triangulateFaces, quadrangulateFaces, pokeFaces, reverseFaces, extractFaces } from '@/kernel/operations/faceOps';
import { mergeVertices, collapseEdges, averageVertices } from '@/kernel/operations/weldOps';
import { growSelection, shrinkSelection, convertSelection, edgeLoop, loopOrPath, type Comp } from '@/kernel/selectionOps';
import type { CustomGeometry } from '@/types';

/** What the selection/transform acts on. Mirrors the studio's ComponentMode. */
export type EditComponent = 'object' | 'vertex' | 'edge' | 'face';

/** How a pick combines with the current selection. */
export type SelectMode = 'replace' | 'add' | 'remove';

/** A resolved component pick in the session's dense index space (what the picker produces). */
export type EditPick =
  | { kind: 'object' | 'face'; face: number }
  | { kind: 'vertex'; vertex: number }
  | { kind: 'edge'; edge: [number, number] };

const pairKey = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);

/**
 * The half-edge-kernel editing backend for in-place Edit Mode, decoupled from any UI framework.
 *
 * It owns a {@link HalfEdgeMesh} (the topology source of truth), the dense↔kernel compaction maps
 * that the viewport's picking/overlays work in, the component selection, and a snapshot undo stack
 * scoped to one edit session. The controller drives it: {@link load} a geometry on entering Edit
 * Mode, run picks/operators/transforms, read {@link geometry} to refresh the preview, and
 * {@link bakeGeometry} to commit back as {@link CustomGeometry}.
 *
 * This is the distilled, store-free port of `modelerStore`'s mesh-management core, so the studio
 * and the scene editor share one kernel editing implementation (the studio version is retired).
 */
export class KernelEditSession {
  private mesh = new HalfEdgeMesh();
  private baked: CustomGeometry = { positions: [], indices: [], normals: [] };
  component: EditComponent = 'object';
  /** Selected component ids — kernel indices whose meaning depends on {@link component}. */
  selection: number[] = [];

  // Dense (render) index ↔ kernel id maps, mirroring `toGeometry`'s compaction.
  private faceOrder: number[] = []; // dense polygon index → kernel face id
  private vertOrder: number[] = []; // dense vertex index → kernel vertex id
  private vertCompact = new Map<number, number>(); // kernel vertex id → dense index
  private edgeByPair = new Map<string, number>(); // "min_max" kernel vertex pair → kernel edge id

  // In-session undo (snapshot per committed operation). The controller commits the net result
  // to the editor's history as one step on exit; this stack is for undo *during* the session.
  private undoStack: ReturnType<HalfEdgeMesh['serialize']>[] = [];
  private redoStack: ReturnType<HalfEdgeMesh['serialize']>[] = [];

  /** Load geometry into a fresh kernel (entering Edit Mode). Clears selection + history. */
  load(geo: CustomGeometry): void {
    this.mesh = fromGeometry(geo);
    this.selection = [];
    this.undoStack = [];
    this.redoStack = [];
    this.rebuild();
  }

  /** The current baked render geometry (kernel → CustomGeometry). */
  get geometry(): CustomGeometry {
    return this.baked;
  }

  /** Bake the current kernel to CustomGeometry (what the controller commits to the entity). */
  bakeGeometry(): CustomGeometry {
    return toGeometry(this.mesh);
  }

  setComponent(component: EditComponent): void {
    this.component = component;
    this.selection = [];
  }

  // ---- selection -----------------------------------------------------------

  /** Apply a component pick (dense indices) to the selection. Null clears it (replace mode). */
  applyPick(pick: EditPick | null, mode: SelectMode = 'replace', loop = false): void {
    if (pick === null) {
      if (mode === 'replace') this.selection = [];
      return;
    }
    if (loop && this.component !== 'object') {
      this.applyLoop(pick, mode);
      return;
    }
    const id = this.kernelIdOf(pick);
    if (id === null) return;
    if (this.component === 'object' && (pick.kind === 'object' || pick.kind === 'face')) {
      // Object mode selects the whole island (connected component) the face belongs to.
      this.updateSelection(this.mesh.faceIsland(this.faceOrder[pick.face]), mode);
      return;
    }
    this.updateSelection([id], mode);
  }

  /** Double-click loop/path selection (edge: the clicked edge's loop; vertex/face: through anchors). */
  private applyLoop(pick: EditPick, mode: SelectMode): void {
    if (this.component === 'edge' && pick.kind === 'edge') {
      const eid = this.edgeFromCompact(pick.edge[0], pick.edge[1]);
      if (eid !== null) this.updateSelection(edgeLoop(this.mesh, eid), mode);
      return;
    }
    const clicked = this.kernelIdOf(pick);
    if (clicked === null) return;
    const anchors = this.selection.includes(clicked) ? this.selection : [...this.selection, clicked];
    const ids = loopOrPath(this.mesh, this.component as Comp, anchors);
    if (ids.length) this.updateSelection(ids, 'replace');
  }

  private updateSelection(ids: number[], mode: SelectMode): void {
    if (mode === 'replace') this.selection = [...new Set(ids)];
    else if (mode === 'add') this.selection = [...new Set([...this.selection, ...ids])];
    else {
      const drop = new Set(ids);
      this.selection = this.selection.filter((x) => !drop.has(x));
    }
  }

  clearSelection(): void {
    this.selection = [];
  }

  /** Grow / shrink the current component selection by one ring. */
  grow(): void {
    if (this.component !== 'object') this.selection = growSelection(this.mesh, this.component as Comp, this.selection);
  }
  shrink(): void {
    if (this.component !== 'object') this.selection = shrinkSelection(this.mesh, this.component as Comp, this.selection);
  }
  /** Convert the selection to another component type (e.g. faces → vertices). */
  convertTo(to: EditComponent): void {
    if (this.component === 'object' || to === 'object') return;
    this.selection = convertSelection(this.mesh, this.component as Comp, this.selection, to as Comp);
    this.component = to;
  }

  // ---- operators (each snapshots first, then rebakes) ----------------------

  extrude(distance = 0.5): void {
    if (!this.selection.length) return;
    this.run(() => {
      const caps = extrudeFaces(this.mesh, this.selection, distance);
      this.selection = caps;
    });
  }
  deleteSelection(): void {
    if (!this.selection.length) return;
    this.run(() => {
      if (this.component === 'edge') dissolveEdges(this.mesh, this.selection);
      else if (this.component === 'vertex') dissolveVertices(this.mesh, this.selection);
      else deleteFaces(this.mesh, this.selection);
      this.selection = [];
    });
  }
  connect(): void {
    if (this.component === 'vertex' && this.selection.length >= 2) this.run(() => connectVertices(this.mesh, this.selection));
  }
  bridge(): void {
    if (this.component === 'edge' && this.selection.length >= 2) this.run(() => bridgeEdges(this.mesh, this.selection));
  }
  poke(): void {
    if (this.selection.length) this.run(() => pokeFaces(this.mesh, this.facesForOp()));
  }
  triangulate(): void {
    if (this.selection.length) this.run(() => triangulateFaces(this.mesh, this.facesForOp()));
  }
  quadrangulate(): void {
    if (this.selection.length) this.run(() => quadrangulateFaces(this.mesh, this.facesForOp()));
  }
  reverseNormals(): void {
    if (this.selection.length) this.run(() => reverseFaces(this.mesh, this.facesForOp()));
  }
  extract(): void {
    if (this.component === 'face' && this.selection.length) this.run(() => { this.selection = extractFaces(this.mesh, this.selection); });
  }
  mergeVertices(): void {
    if (this.component === 'vertex' && this.selection.length >= 2) this.run(() => mergeVertices(this.mesh, this.selection));
  }
  collapseEdges(): void {
    if (this.component === 'edge' && this.selection.length) this.run(() => collapseEdges(this.mesh, this.selection));
  }
  averageVertices(): void {
    if (this.component === 'vertex' && this.selection.length) this.run(() => averageVertices(this.mesh, this.selection));
  }
  duplicateSelection(): void {
    if (this.selection.length) this.run(() => { this.selection = duplicateFaces(this.mesh, this.facesForOp()); });
  }
  /** Commit a loop cut through a dense edge [a,b] at slide ratio t. */
  loopCut(edge: [number, number], t = 0.5): void {
    const eid = this.edgeFromCompact(edge[0], edge[1]);
    if (eid !== null) this.run(() => loopCut(this.mesh, eid, t));
  }
  /** Commit a knife path (dense edge points). */
  knife(path: KnifePoint[]): void {
    this.run(() => knifeCut(this.mesh, path));
  }

  // ---- transform (gizmo drag) ----------------------------------------------

  /** Snapshot before a gizmo drag so the whole drag is one undo step. */
  beginTransform(): void {
    this.pushUndo();
  }
  /** Move the selected components' vertices by a delta (live, no snapshot). */
  translateSelection(dx: number, dy: number, dz: number): void {
    for (const v of this.selectedVertices()) {
      const p = this.mesh.vertices[v].position;
      p[0] += dx; p[1] += dy; p[2] += dz;
    }
  }
  /** Re-bake after a live transform (the kernel positions were already mutated). */
  endTransform(): void {
    this.rebuild();
  }

  // ---- undo / redo (in-session) --------------------------------------------

  canUndo(): boolean { return this.undoStack.length > 0; }
  canRedo(): boolean { return this.redoStack.length > 0; }
  undo(): void {
    const snap = this.undoStack.pop();
    if (!snap) return;
    this.redoStack.push(this.mesh.serialize());
    this.mesh.deserialize(snap);
    this.selection = [];
    this.rebuild();
  }
  redo(): void {
    const snap = this.redoStack.pop();
    if (!snap) return;
    this.undoStack.push(this.mesh.serialize());
    this.mesh.deserialize(snap);
    this.selection = [];
    this.rebuild();
  }

  // ---- overlay/transform read helpers (dense indices for the viewport) -----

  /** Dense polygon indices to highlight (object/face mode = the selected faces/island). */
  selectionPolygons(): number[] {
    if (this.component === 'object' || this.component === 'face') {
      return this.selection.map((f) => this.faceOrder.indexOf(f)).filter((i) => i >= 0);
    }
    return [];
  }
  /** Dense vertex indices to highlight (vertex mode). */
  selectionVerticesCompact(): number[] {
    if (this.component !== 'vertex') return [];
    return this.selection.map((v) => this.vertCompact.get(v)).filter((i): i is number => i !== undefined);
  }
  /** Dense edge endpoint pairs to highlight (edge mode). */
  selectionEdgesCompact(): Array<[number, number]> {
    if (this.component !== 'edge') return [];
    const out: Array<[number, number]> = [];
    for (const e of this.selection) {
      if (!this.mesh.edges[e] || this.mesh.edges[e].removed) continue;
      const [a, b] = this.mesh.edgeVertices(e);
      const ca = this.vertCompact.get(a);
      const cb = this.vertCompact.get(b);
      if (ca !== undefined && cb !== undefined) out.push([ca, cb]);
    }
    return out;
  }
  /** World centroid of the active selection's vertices, or null when nothing is selected. */
  selectionCentroid(): [number, number, number] | null {
    const vids = this.selectedVertices();
    if (!vids.length) return null;
    let x = 0, y = 0, z = 0;
    for (const v of vids) {
      const p = this.mesh.vertices[v].position;
      x += p[0]; y += p[1]; z += p[2];
    }
    return [x / vids.length, y / vids.length, z / vids.length];
  }

  // ---- internals -----------------------------------------------------------

  /** Run a mutating operation as one undo step, then re-bake + refresh maps. */
  private run(op: () => void): void {
    this.pushUndo();
    op();
    this.rebuild();
  }
  private pushUndo(): void {
    this.undoStack.push(this.mesh.serialize());
    this.redoStack = [];
  }

  /** Faces the current op should target: the selection in face mode, or the verts'/edges' faces. */
  private facesForOp(): number[] {
    if (this.component === 'face' || this.component === 'object') return this.selection;
    return this.selection; // callers only invoke face ops in face/object mode
  }

  /** Kernel vertex ids the active selection resolves to (drives transforms + centroid). */
  private selectedVertices(): number[] {
    const m = this.mesh;
    if (this.component === 'object' || this.component === 'face') {
      const set = new Set<number>();
      for (const f of this.selection) for (const v of m.faceVertices(f)) set.add(v);
      return [...set];
    }
    if (this.component === 'vertex') return this.selection.filter((v) => m.vertices[v] && !m.vertices[v].removed);
    const verts = new Set<number>();
    for (const e of this.selection) {
      if (m.edges[e] && !m.edges[e].removed) {
        const [a, b] = m.edgeVertices(e);
        verts.add(a); verts.add(b);
      }
    }
    return [...verts];
  }

  /** Resolve a dense pick to its kernel id (face/vertex/edge), or null. */
  private kernelIdOf(pick: EditPick): number | null {
    if (pick.kind === 'vertex') return this.vertOrder[pick.vertex] ?? null;
    if (pick.kind === 'edge') return this.edgeFromCompact(pick.edge[0], pick.edge[1]);
    return this.faceOrder[pick.face] ?? null; // object | face
  }

  private edgeFromCompact(a: number, b: number): number | null {
    const ka = this.vertOrder[a];
    const kb = this.vertOrder[b];
    if (ka === undefined || kb === undefined) return null;
    return this.edgeByPair.get(pairKey(ka, kb)) ?? null;
  }

  /** Re-bake geometry + rebuild the compaction maps from the current kernel. */
  private rebuild(): void {
    this.baked = toGeometry(this.mesh);
    this.faceOrder = this.mesh.liveFaces();
    this.vertOrder = [];
    this.vertCompact = new Map();
    this.mesh.vertices.forEach((v, i) => {
      if (v.removed) return;
      this.vertCompact.set(i, this.vertOrder.length);
      this.vertOrder.push(i);
    });
    this.edgeByPair = new Map();
    for (const e of this.mesh.liveEdges()) {
      const [a, b] = this.mesh.edgeVertices(e);
      this.edgeByPair.set(pairKey(a, b), e);
    }
  }
}

export type { V3, KnifePoint };
