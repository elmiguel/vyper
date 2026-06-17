import { snapshotCommand } from '@/kernel/commands';
import { triangulateFaces, quadrangulateFaces, pokeFaces, reverseFaces, extractFaces } from '@/kernel/operations/faceOps';
import { mergeVertices, collapseEdges, averageVertices } from '@/kernel/operations/weldOps';
import {
  growSelection as kGrow, shrinkSelection as kShrink, convertSelection as kConvert,
  edgeRing as kEdgeRing, loopOrPath, type Comp,
} from '@/kernel/selectionOps';
import type { EditActionsCtx } from './modelerEditActions';
import type { ComponentMode } from './modelerStore';

/** Mesh + selection actions added on top of the core store (kept here so the store file
 *  stays focused). {@link ModelerState} extends this interface. */
export interface MeshActions {
  /** Fan-triangulate the selected faces (or whole mesh). */
  triangulate: () => void;
  /** Merge coplanar triangle pairs in the selection (or whole mesh) back into quads. */
  quadrangulate: () => void;
  /** Poke the selected faces (center vertex + triangle fan). */
  poke: () => void;
  /** Reverse the winding (normals) of the selected faces (or whole mesh). */
  reverseNormals: () => void;
  /** Detach the selected faces into their own shell. */
  extract: () => void;
  /** Merge the selected vertices to their center (vertex mode). */
  mergeVerts: () => void;
  /** Collapse the selected edges (edge mode). */
  collapse: () => void;
  /** Relax the selected vertices toward their neighbours (vertex mode). */
  average: () => void;
  /** Grow the component selection by one ring. */
  grow: () => void;
  /** Shrink the component selection by one ring. */
  shrink: () => void;
  /** Select the loop through the selection's anchors: the edge loop through a selected edge,
   *  or — given two selected verts/faces — the vertex/face loop running through both. */
  selectLoop: () => void;
  /** Select the edge ring through the first selected edge (edge mode). */
  selectEdgeRing: () => void;
  /** Convert the current selection to another component type. */
  convertTo: (to: ComponentMode) => void;
}

/** Build the mesh + selection actions from the shared store context. */
export function createMeshActions(ctx: EditActionsCtx): MeshActions {
  const { stack, get, set, rebuild, sync } = ctx;
  /** Run a geometry op as one undoable command, dropping the no-op step if it returned false. */
  const geom = (label: string, fn: () => boolean, reselect?: () => void) => {
    let ok = false;
    stack.run(snapshotCommand(ctx.mesh(), label, () => { ok = fn(); }));
    if (!ok) stack.undo();
    rebuild();
    sync();
    if (reselect && ok) reselect();
    else set((s) => ({ selection: [], selRevision: s.selRevision + 1 }));
  };
  const faceTargets = () => {
    const { component, selection } = get();
    return component === 'face' ? selection : [];
  };
  /** Replace the selection (no geometry change) and refresh the highlight. */
  const reselect = (selection: number[], component?: ComponentMode) =>
    set((s) => ({ selection, component: component ?? s.component, objectSelected: false, selRevision: s.selRevision + 1 }));

  return {
    triangulate: () => geom('Triangulate', () => triangulateFaces(ctx.mesh(), faceTargets())),
    quadrangulate: () => geom('Quadrangulate', () => quadrangulateFaces(ctx.mesh(), faceTargets())),
    poke: () => geom('Poke', () => pokeFaces(ctx.mesh(), faceTargets())),
    reverseNormals: () => geom('Reverse Normals', () => reverseFaces(ctx.mesh(), faceTargets())),
    extract: () => {
      if (get().component !== 'face' || get().selection.length === 0) return;
      let caps: number[] = [];
      stack.run(snapshotCommand(ctx.mesh(), 'Extract', () => { caps = extractFaces(ctx.mesh(), get().selection); }));
      if (caps.length === 0) stack.undo();
      rebuild();
      sync();
      const order = ctx.faceOrder();
      set((s) => ({ selection: caps.map((d) => order[d]).filter((k): k is number => k !== undefined), selRevision: s.selRevision + 1 }));
    },
    mergeVerts: () => {
      if (get().component !== 'vertex' || get().selection.length < 2) return;
      geom('Merge Vertices', () => mergeVertices(ctx.mesh(), get().selection));
    },
    collapse: () => {
      if (get().component !== 'edge' || get().selection.length === 0) return;
      geom('Collapse Edge', () => collapseEdges(ctx.mesh(), get().selection));
    },
    average: () => {
      if (get().component !== 'vertex' || get().selection.length === 0) return;
      geom('Average Vertices', () => averageVertices(ctx.mesh(), get().selection));
    },
    grow: () => {
      const { component, selection } = get();
      if (component === 'object' || selection.length === 0) return;
      reselect(kGrow(ctx.mesh(), component as Comp, selection));
    },
    shrink: () => {
      const { component, selection } = get();
      if (component === 'object' || selection.length === 0) return;
      reselect(kShrink(ctx.mesh(), component as Comp, selection));
    },
    selectLoop: () => {
      const { component, selection } = get();
      if (component === 'object') return;
      const ids = loopOrPath(ctx.mesh(), component as Comp, selection);
      if (ids.length) reselect(ids);
    },
    selectEdgeRing: () => {
      const { component, selection } = get();
      if (component !== 'edge' || selection[0] === undefined) return;
      reselect(kEdgeRing(ctx.mesh(), selection[0]));
    },
    convertTo: (to) => {
      const { component, selection } = get();
      if (component === 'object' || to === 'object' || selection.length === 0) return;
      reselect(kConvert(ctx.mesh(), component as Comp, selection, to as Comp), to);
    },
  };
}
