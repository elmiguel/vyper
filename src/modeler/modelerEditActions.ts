import type { HalfEdgeMesh, V3 } from '@/kernel/HalfEdgeMesh';
import { CommandStack, snapshotCommand } from '@/kernel/commands';
import { connectVertices } from '@/kernel/operations/connect';
import { bridgeEdges } from '@/kernel/operations/bridge';
import { loopCut, loopCutPreview } from '@/kernel/operations/loopcut';
import { knifeCut, type KnifePoint } from '@/kernel/operations/knife';
import {
  deleteFaces, dissolveVertices, dissolveEdges, splitEdges, addFace, addPolygon, duplicateFaces, pasteFaces,
} from '@/kernel/operations/editOps';
import type { ModelerState } from './modelerStore';

/** A loose zustand setter accepting either a patch or an updater. */
type SetState = (partial: Partial<ModelerState> | ((s: ModelerState) => Partial<ModelerState>)) => void;

/** Unnormalized Newell normal of a polygon (magnitude ≈ 2× area; sign gives orientation). */
function newellNormal(pts: V3[]): V3 {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return [nx, ny, nz];
}

/** Clipboard payload shared with the store. */
export interface Clip {
  positions: V3[];
  loops: number[][];
}

/** Everything the edit-operation actions need from the store/kernel. The mesh + clipboard
 *  are accessed through getters because the store reassigns them. */
export interface EditActionsCtx {
  mesh: () => HalfEdgeMesh;
  stack: CommandStack;
  get: () => ModelerState;
  set: SetState;
  rebuild: () => void;
  sync: () => void;
  /** Current dense-polygon-index → kernel-face-id map (from the last rebuild). */
  faceOrder: () => number[];
  /** Kernel vertex ids in the current selection, expanded per component mode. */
  selectedVertices: () => number[];
  kernelEdgeFromCompact: (a: number, b: number) => number | null;
  getClipboard: () => Clip | null;
  setClipboard: (c: Clip | null) => void;
}

/** The kernel-operation actions (connect/bridge/loop-cut/knife/draw-poly/delete/duplicate/
 *  copy/paste/add) for the Modeling Studio store. Extracted from modelerStore to keep that
 *  file focused on state + selection/transform; each action snapshots → mutates → rebuilds. */
export function createEditActions(ctx: EditActionsCtx): Pick<
  ModelerState,
  | 'connect' | 'bridge' | 'loopCutPreview' | 'loopCutCommit' | 'knifeCommit' | 'drawPolyCommit'
  | 'deleteSelection' | 'duplicateSelection' | 'copySelection' | 'paste' | 'canPaste'
  | 'addFaceFromSelection' | 'addVertexOnEdges' | 'sketchTopoCommit'
> {
  const { stack, get, set, rebuild, sync } = ctx;
  const reselect = () => set((s) => ({ selection: [], selRevision: s.selRevision + 1 }));

  return {
    connect: () => {
      if (get().component !== 'vertex') return;
      const verts = get().selection;
      if (verts.length < 2) return;
      stack.run(snapshotCommand(ctx.mesh(), 'Connect', () => connectVertices(ctx.mesh(), verts)));
      reselect();
      rebuild();
      sync();
    },

    bridge: () => {
      if (get().component !== 'edge') return;
      const edges = get().selection;
      if (edges.length < 2) return;
      let ok = false;
      stack.run(snapshotCommand(ctx.mesh(), 'Bridge', () => { ok = bridgeEdges(ctx.mesh(), edges); }));
      if (!ok) stack.undo(); // selection didn't form two bridgeable loops
      reselect();
      rebuild();
      sync();
    },

    loopCutPreview: (compactEdge, t = 0.5) => {
      if (!compactEdge) return [];
      const eid = ctx.kernelEdgeFromCompact(compactEdge[0], compactEdge[1]);
      return eid === null ? [] : loopCutPreview(ctx.mesh(), eid, t);
    },

    loopCutCommit: (compactEdge, t = 0.5) => {
      const eid = ctx.kernelEdgeFromCompact(compactEdge[0], compactEdge[1]);
      if (eid === null || loopCutPreview(ctx.mesh(), eid, t).length === 0) return; // not a cuttable strip
      stack.run(snapshotCommand(ctx.mesh(), 'Loop Cut', () => loopCut(ctx.mesh(), eid, t)));
      reselect();
      rebuild();
      sync();
    },

    sketchTopoCommit: (verts, faces) => {
      if (faces.length === 0) return; // nothing sketched yet
      stack.run(snapshotCommand(ctx.mesh(), 'Sketch Retopo', () => ctx.mesh().buildFromPolygons(verts, faces)));
      reselect();
      rebuild();
      sync();
    },

    knifeCommit: (path) => {
      if (path.length < 2) return false;
      let ok = false;
      stack.run(snapshotCommand(ctx.mesh(), 'Knife', () => { ok = knifeCut(ctx.mesh(), path); }));
      if (!ok) {
        stack.undo();
        return false;
      }
      reselect();
      rebuild();
      sync();
      return true;
    },

    drawPolyCommit: (points) => {
      // Reject degenerate (collinear / near-zero-area) outlines; orient the face upward so
      // its surface is consistent regardless of click direction.
      const n = newellNormal(points);
      if (points.length < 3 || Math.hypot(n[0], n[1], n[2]) < 1e-6) return false;
      const oriented = n[1] < 0 ? [...points].reverse() : points;
      stack.run(snapshotCommand(ctx.mesh(), 'Draw Poly', () => addPolygon(ctx.mesh(), oriented)));
      set((s) => ({ selRevision: s.selRevision + 1 }));
      rebuild();
      sync();
      return true;
    },

    deleteSelection: () => {
      const { component, selection, objectSelected } = get();
      let ok = false;
      stack.run(snapshotCommand(ctx.mesh(), 'Delete', () => {
        if (component === 'object') ok = objectSelected && deleteFaces(ctx.mesh(), ctx.faceOrder().slice());
        else if (component === 'face') ok = deleteFaces(ctx.mesh(), selection);
        else if (component === 'vertex') ok = dissolveVertices(ctx.mesh(), selection);
        else ok = dissolveEdges(ctx.mesh(), selection);
      }));
      if (!ok) stack.undo();
      set((s) => ({ selection: [], objectSelected: false, selRevision: s.selRevision + 1 }));
      rebuild();
      sync();
    },

    duplicateSelection: () => {
      const { component, selection } = get();
      const faces = component === 'object' ? ctx.faceOrder().slice() : component === 'face' ? selection : [];
      if (faces.length === 0) return;
      let caps: number[] = [];
      stack.run(snapshotCommand(ctx.mesh(), 'Duplicate', () => { caps = duplicateFaces(ctx.mesh(), faces, [0, 0, 0]); }));
      rebuild();
      sync();
      if (component === 'face') {
        const order = ctx.faceOrder();
        set((s) => ({ selection: caps.map((d) => order[d]).filter((k): k is number => k !== undefined), selRevision: s.selRevision + 1 }));
      } else {
        set((s) => ({ selRevision: s.selRevision + 1 })); // object stays fully selected
      }
    },

    copySelection: () => {
      const { component, selection } = get();
      const mesh = ctx.mesh();
      const faces = component === 'object' ? ctx.faceOrder().slice() : component === 'face' ? selection : [];
      const idx = new Map<number, number>();
      const positions: V3[] = [];
      const loops: number[][] = [];
      for (const f of faces) {
        if (!mesh.faces[f] || mesh.faces[f].removed) continue;
        loops.push(
          mesh.faceVertices(f).map((v) => {
            let li = idx.get(v);
            if (li === undefined) {
              li = positions.length;
              idx.set(v, li);
              positions.push([...mesh.vertices[v].position]);
            }
            return li;
          }),
        );
      }
      ctx.setClipboard(loops.length ? { positions, loops } : null);
    },

    paste: () => {
      const cb = ctx.getClipboard();
      if (!cb) return;
      let caps: number[] = [];
      stack.run(snapshotCommand(ctx.mesh(), 'Paste', () => { caps = pasteFaces(ctx.mesh(), cb.positions, cb.loops, [0, 0.5, 0]); }));
      rebuild();
      sync();
      const order = ctx.faceOrder();
      set((s) => ({ component: 'face', objectSelected: false, selection: caps.map((d) => order[d]).filter((k): k is number => k !== undefined), selRevision: s.selRevision + 1 }));
    },

    canPaste: () => ctx.getClipboard() !== null,

    addFaceFromSelection: () => {
      if (get().component !== 'vertex' || get().selection.length < 3) return;
      const verts = get().selection;
      stack.run(snapshotCommand(ctx.mesh(), 'Add Face', () => addFace(ctx.mesh(), verts)));
      reselect();
      rebuild();
      sync();
    },

    addVertexOnEdges: () => {
      if (get().component !== 'edge' || get().selection.length === 0) return;
      const edges = get().selection;
      let ok = false;
      stack.run(snapshotCommand(ctx.mesh(), 'Add Vertex', () => { ok = splitEdges(ctx.mesh(), edges); }));
      if (!ok) stack.undo();
      reselect();
      rebuild();
      sync();
    },
  };
}
