import { HalfEdgeMesh, type V3 } from '@/kernel/HalfEdgeMesh';
import { toGeometry, fromGeometry } from '@/kernel/render';
import { extrudeFaces } from '@/kernel/operations/extrude';
import { deleteFaces, dissolveEdges, dissolveVertices, duplicateFaces, pasteFaces, addFace, splitEdges, addPolygon } from '@/kernel/operations/editOps';
import { connectVertices } from '@/kernel/operations/connect';
import { bridgeEdges } from '@/kernel/operations/bridge';
import { loopCut } from '@/kernel/operations/loopcut';
import { knifeCut, type KnifePoint } from '@/kernel/operations/knife';
import { triangulateFaces, quadrangulateFaces, pokeFaces, reverseFaces, extractFaces } from '@/kernel/operations/faceOps';
import { mergeVertices, collapseEdges, averageVertices } from '@/kernel/operations/weldOps';
import { growSelection, shrinkSelection, convertSelection, edgeLoop, edgeRing, loopOrPath, type Comp } from '@/kernel/selectionOps';
import { ObjectGroups } from './islands';
import { selectionBounds, type SelectionBounds } from './selectionBounds';
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

/** Bake a standalone polygon cage (verts + face loops) into render geometry — used to turn a
 *  sketch-retopo result into its own new object, independent of the mesh it was drawn over. */
export function cageGeometry(verts: V3[], faces: number[][]): CustomGeometry {
  const m = new HalfEdgeMesh();
  m.buildFromPolygons(verts, faces);
  return toGeometry(m);
}

const DEG = Math.PI / 180;
/** Unit quaternion for an intrinsic X→Y→Z euler rotation (degrees). Kernel-local (Babylon-free). */
function quatFromEulerDeg(x: number, y: number, z: number): { x: number; y: number; z: number; w: number } {
  const hx = x * DEG * 0.5, hy = y * DEG * 0.5, hz = z * DEG * 0.5;
  const cx = Math.cos(hx), sx = Math.sin(hx);
  const cy = Math.cos(hy), sy = Math.sin(hy);
  const cz = Math.cos(hz), sz = Math.sin(hz);
  return {
    x: sx * cy * cz + cx * sy * sz,
    y: cx * sy * cz - sx * cy * sz,
    z: cx * cy * sz + sx * sy * cz,
    w: cx * cy * cz - sx * sy * sz,
  };
}

/** Rotate a vector by a unit quaternion (kernel-local; avoids a Babylon dependency in the session). */
function quatRotate(q: { x: number; y: number; z: number; w: number }, vx: number, vy: number, vz: number): [number, number, number] {
  const tx = 2 * (q.y * vz - q.z * vy);
  const ty = 2 * (q.z * vx - q.x * vz);
  const tz = 2 * (q.x * vy - q.y * vx);
  return [vx + q.w * tx + (q.y * tz - q.z * ty), vy + q.w * ty + (q.z * tx - q.x * tz), vz + q.w * tz + (q.x * ty - q.y * tx)];
}

/** Newell's method area-weighted normal of a polygon outline (robust for non-planar loops). */
function newellNormal(pts: V3[]): V3 {
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return [nx, ny, nz];
}

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
  /** Island grouping — grouped islands select/transform as one (face mode). Runtime-only. */
  private groups = new ObjectGroups();
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

  /** Welded face clipboard (copy → paste), as positions + local-index loops. */
  private clipboard: { positions: V3[]; loops: number[][] } | null = null;

  /** Load geometry into a fresh kernel (entering Edit Mode). Clears selection + history. */
  load(geo: CustomGeometry): void {
    this.mesh = fromGeometry(geo);
    this.selection = [];
    this.undoStack = [];
    this.redoStack = [];
    this.groups.clear();
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
    // Face mode: clicking a grouped island selects the whole group (so it moves as one).
    if (this.component === 'face' && (pick.kind === 'face' || pick.kind === 'object') && mode === 'replace' && this.groups.isGrouped(this.mesh, id)) {
      this.updateSelection(this.groups.islandsForFocus(this.mesh, id).flat(), 'replace');
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
  /** Select the loop through the selection: the edge loop through a selected edge, or the
   *  vertex/face loop running through two selected anchors. */
  selectLoop(): void {
    if (this.component === 'object') return;
    const ids = loopOrPath(this.mesh, this.component as Comp, this.selection);
    if (ids.length) this.selection = [...new Set(ids)];
  }
  /** Select the edge ring through the first selected edge (edge mode). */
  selectRing(): void {
    if (this.component === 'edge' && this.selection[0] !== undefined) this.selection = edgeRing(this.mesh, this.selection[0]);
  }
  /** Group the islands touched by the face selection (≥2 islands) so they select/move as one. */
  group(): void {
    if (this.component !== 'face' || this.selection.length === 0) return;
    this.groups.group(this.mesh, this.selection);
    this.selection = this.groups.islandsForFocus(this.mesh, this.selection[0]).flat();
  }
  /** Ungroup the group the face selection belongs to, back into separate islands. */
  ungroup(): void {
    if (this.component !== 'face' || this.selection.length === 0) return;
    this.groups.ungroup(this.mesh, this.selection);
  }
  /** Whether the current face selection belongs to a group (drives Ungroup enablement). */
  isSelectionGrouped(): boolean {
    return this.component === 'face' && this.selection.length > 0 && this.groups.isGrouped(this.mesh, this.selection[0]);
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
  /** Create a face from ≥3 selected vertices (vertex mode). */
  addFaceFromSelection(): void {
    if (this.component === 'vertex' && this.selection.length >= 3) this.run(() => { addFace(this.mesh, this.selection); this.selection = []; });
  }
  /** Insert a vertex at the midpoint of each selected edge (edge mode). */
  addVertexOnEdges(): void {
    if (this.component === 'edge' && this.selection.length) this.run(() => { splitEdges(this.mesh, this.selection); });
  }
  /** Duplicate the face-scoped selection (object = whole mesh, face = selected faces) in place,
   *  re-selecting the new copies in face mode. */
  duplicateSelection(): void {
    const faces = this.clipboardFaces();
    if (!faces.length) return;
    this.pushUndo();
    const caps = duplicateFaces(this.mesh, faces, [0, 0, 0]);
    this.rebuild();
    this.component = 'face';
    this.reselectDense(caps);
  }
  /** Copy the face-scoped selection to the clipboard (welded positions + local-index loops). */
  copySelection(): void {
    const faces = this.clipboardFaces();
    const idx = new Map<number, number>();
    const positions: V3[] = [];
    const loops: number[][] = [];
    for (const f of faces) {
      if (!this.mesh.faces[f] || this.mesh.faces[f].removed) continue;
      loops.push(
        this.mesh.faceVertices(f).map((v) => {
          let li = idx.get(v);
          if (li === undefined) { li = positions.length; idx.set(v, li); positions.push([...this.mesh.vertices[v].position]); }
          return li;
        }),
      );
    }
    this.clipboard = loops.length ? { positions, loops } : null;
  }
  /** Paste the clipboard faces (offset slightly), selecting them in face mode. */
  paste(): void {
    const cb = this.clipboard;
    if (!cb) return;
    this.pushUndo();
    const caps = pasteFaces(this.mesh, cb.positions, cb.loops, [0, 0.5, 0]);
    this.rebuild();
    this.component = 'face';
    this.reselectDense(caps);
  }
  canPaste(): boolean { return this.clipboard !== null; }
  /** Kernel face ids the clipboard ops act on: the whole mesh (object), the face selection
   *  (face mode), or none (vertex/edge). */
  private clipboardFaces(): number[] {
    if (this.component === 'object') return this.mesh.liveFaces();
    if (this.component === 'face') return [...this.selection];
    return [];
  }
  /** Re-select faces given as post-rebuild dense polygon indices (maps back to kernel ids). */
  private reselectDense(dense: number[]): void {
    this.selection = dense.map((d) => this.faceOrder[d]).filter((k): k is number => k !== undefined);
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
  /** Commit a drawn polygon (local-space points) as a new face. Returns false if degenerate. */
  drawPolyCommit(points: V3[]): boolean {
    const n = newellNormal(points);
    if (points.length < 3 || Math.hypot(n[0], n[1], n[2]) < 1e-6) return false;
    const oriented = n[1] < 0 ? [...points].reverse() : points; // face upward, click-direction agnostic
    this.run(() => addPolygon(this.mesh, oriented));
    return true;
  }
  /** Replace the mesh with a sketch-retopo quad cage (welded verts + quad face loops). */
  sketchTopoCommit(verts: V3[], faces: number[][]): void {
    if (!faces.length) return;
    this.run(() => this.mesh.buildFromPolygons(verts, faces));
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
  /** Rotate the selected vertices by a unit quaternion about a local-space pivot (live). */
  rotateSelection(q: { x: number; y: number; z: number; w: number }, pivot: [number, number, number]): void {
    for (const v of this.selectedVertices()) {
      const p = this.mesh.vertices[v].position;
      const [x, y, z] = quatRotate(q, p[0] - pivot[0], p[1] - pivot[1], p[2] - pivot[2]);
      p[0] = pivot[0] + x; p[1] = pivot[1] + y; p[2] = pivot[2] + z;
    }
  }
  /** Scale the selected vertices about a local-space pivot (live). */
  scaleSelection(sx: number, sy: number, sz: number, pivot: [number, number, number]): void {
    for (const v of this.selectedVertices()) {
      const p = this.mesh.vertices[v].position;
      p[0] = pivot[0] + (p[0] - pivot[0]) * sx;
      p[1] = pivot[1] + (p[1] - pivot[1]) * sy;
      p[2] = pivot[2] + (p[2] - pivot[2]) * sz;
    }
  }
  /** Re-bake after a live transform (the kernel positions were already mutated). */
  endTransform(): void {
    this.rebuild();
  }

  // ---- numeric transform (Inspector fields) --------------------------------

  /** Axis-aligned bounds of the current selection's vertices (centre + size for the Inspector). */
  selectionBounds(): SelectionBounds {
    return selectionBounds(this.mesh, this.selectedVertices());
  }
  /** Move the selection so its centroid sits at `value` along one axis. Returns true if changed. */
  setSelectionCenter(axis: 0 | 1 | 2, value: number): boolean {
    const b = this.selectionBounds();
    if (b.count === 0) return false;
    const delta = value - b.center[axis];
    if (delta === 0) return false;
    this.beginTransform();
    this.translateSelection(axis === 0 ? delta : 0, axis === 1 ? delta : 0, axis === 2 ? delta : 0);
    this.endTransform();
    return true;
  }
  /** Scale the selection about its centroid so its extent along one axis equals `value`. */
  setSelectionDimension(axis: 0 | 1 | 2, value: number): boolean {
    const b = this.selectionBounds();
    if (b.count === 0 || b.size[axis] < 1e-6) return false; // can't resize a flat/zero axis
    const factor = Math.max(value, 0) / b.size[axis];
    if (factor === 1) return false;
    this.beginTransform();
    this.scaleSelection(axis === 0 ? factor : 1, axis === 1 ? factor : 1, axis === 2 ? factor : 1, b.center);
    this.endTransform();
    return true;
  }
  /** Rotate the selection about its centroid by an euler delta (degrees). Returns true if changed. */
  nudgeSelectionRotation(ex: number, ey: number, ez: number): boolean {
    const b = this.selectionBounds();
    if (b.count === 0 || (ex === 0 && ey === 0 && ez === 0)) return false;
    this.beginTransform();
    this.rotateSelection(quatFromEulerDeg(ex, ey, ez), b.center);
    this.endTransform();
    return true;
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

  /** Faces a face-op targets: the face selection in face mode, else [] = the whole mesh
   *  (the kernel ops treat an empty list as "all faces"). */
  private facesForOp(): number[] {
    return this.component === 'face' ? this.selection : [];
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
    this.groups.refresh(this.mesh); // re-sync group membership before ids are reread
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
