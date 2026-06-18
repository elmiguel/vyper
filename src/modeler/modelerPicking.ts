import type { HalfEdgeMesh } from '@/kernel/HalfEdgeMesh';
import { loopOrPath, edgeLoop, type Comp } from '@/kernel/selectionOps';
import type { ModelerPick } from './ModelerScene';
import type { ModelerState } from './modelerStore';
import type { ActiveObject } from './modelerFocus';
import type { ObjectGroups } from './modelerGroups';

type SetState = (partial: Partial<ModelerState> | ((s: ModelerState) => Partial<ModelerState>)) => void;

/** What the pick/selection actions need from the store (mesh + compaction maps are accessed
 *  through getters because the store reassigns them on every rebuild). */
export interface PickCtx {
  get: () => ModelerState;
  set: SetState;
  mesh: () => HalfEdgeMesh;
  vertOrder: () => number[];
  faceOrder: () => number[];
  edgeFromCompact: (a: number, b: number) => number | null;
  /** The focused object (component picking/editing locks to it). */
  active: ActiveObject;
  /** Object groups — clicking a grouped object focuses the whole group. */
  groups: ObjectGroups;
}

/**
 * Selection + focus-lock actions for the Modeling Studio store (extracted from modelerStore to
 * keep it focused, mirroring {@link createEditActions}). Owns `applyPick` — which resolves a
 * viewport pick into a selection change — plus the active-object focus lock: component-mode
 * picking stays on the focused object so it doesn't jump to whatever is touched, and a
 * double-click expands the loop/path through the anchors selected before it.
 */
export function createPickActions(ctx: PickCtx): Pick<ModelerState, 'applyPick' | 'clearSelection' | 'activePolygonIndices'> {
  const { get, set, active } = ctx;
  /** Selection just before the most recent single click — the anchor set a following
   *  double-click uses (its first click would otherwise have cleared it). */
  let beforeClick: number[] = [];

  const updateSelection = (ids: number[], mode: 'replace' | 'add' | 'remove') => {
    set((s) => {
      let selection: number[];
      if (mode === 'replace') selection = [...new Set(ids)];
      else if (mode === 'add') selection = [...new Set([...s.selection, ...ids])];
      else {
        const drop = new Set(ids);
        selection = s.selection.filter((x) => !drop.has(x));
      }
      return { selection, objectSelected: s.component === 'object' ? selection.length > 0 : s.objectSelected, selRevision: s.selRevision + 1 };
    });
  };

  /** Whether a component pick lands on the focused object (so it isn't a jump to another). */
  const pickOnActive = (pick: NonNullable<ModelerPick>): boolean => {
    if (pick.kind === 'vertex') return active.verts.has(ctx.vertOrder()[pick.vertex]);
    if (pick.kind === 'edge') return active.verts.has(ctx.vertOrder()[pick.edge[0]]) && active.verts.has(ctx.vertOrder()[pick.edge[1]]);
    return active.faces.has(ctx.faceOrder()[pick.face]);
  };

  const clearSelection = () => set((s) => ({ selection: [], objectSelected: false, selRevision: s.selRevision + 1 }));

  const applyPick: ModelerState['applyPick'] = (pick, additive = false, subtract = false, loop = false) => {
    const mesh = ctx.mesh();
    const component = get().component;
    const mode = subtract ? 'remove' : additive ? 'add' : 'replace';
    // Focus lock (vertex/edge/face): editing stays on the focused object — the one selected in
    // object mode before entering this mode. Picks on other (dimmed) objects are ignored so the
    // working object never jumps; switch objects back in Object mode. With nothing focused there
    // is nothing to edit (you can't reach an edit mode without a focused object), so bail.
    if (component !== 'object' && pick) {
      if (!active.isSet || !pickOnActive(pick)) return;
    }
    // Double-click selects a loop. Edge: the clicked edge fixes its loop directly. Vertex/face:
    // a single point/face has no direction, so use the anchors selected *before* this
    // double-click plus the clicked one, and find the loop — or path — through them.
    if (loop && component !== 'object' && pick) {
      if (component === 'edge' && pick.kind === 'edge') {
        const eid = ctx.edgeFromCompact(pick.edge[0], pick.edge[1]);
        if (eid !== null) updateSelection(edgeLoop(mesh, eid), mode);
        return;
      }
      const clicked = pick.kind === 'vertex' ? ctx.vertOrder()[pick.vertex]
        : pick.kind === 'face' || pick.kind === 'object' ? ctx.faceOrder()[pick.face]
          : undefined;
      const anchors = [...beforeClick];
      if (clicked !== undefined && !anchors.includes(clicked)) anchors.push(clicked);
      const ids = loopOrPath(mesh, component as Comp, anchors);
      if (ids.length) updateSelection(ids, 'replace');
      return;
    }
    // Snapshot the current selection so the *next* double-click can use it as anchors.
    beforeClick = [...get().selection];
    if (pick === null) {
      if (mode === 'replace') {
        // Clicking empty space in object mode deselects *and* drops the focused object, so the
        // current object always mirrors the object-mode selection (and edit modes lock back out).
        if (component === 'object' && active.isSet) {
          active.clear();
          set((s) => ({ activeRevision: s.activeRevision + 1 }));
        }
        clearSelection();
      }
      return;
    }
    if (pick.kind === 'object' && component === 'object') {
      // Select + focus the clicked object — the whole group if it belongs to one.
      const kernelFace = ctx.faceOrder()[pick.face];
      if (kernelFace !== undefined) {
        const islands = ctx.groups.islandsForFocus(mesh, kernelFace);
        active.setIslands(mesh, islands);
        updateSelection(islands.flat(), mode);
        set((s) => ({ activeRevision: s.activeRevision + 1 }));
      }
      return;
    }
    if (pick.kind === 'face' && component === 'face') {
      const kernelFace = ctx.faceOrder()[pick.face];
      if (kernelFace !== undefined) updateSelection([kernelFace], mode);
      return;
    }
    if (pick.kind === 'vertex' && component === 'vertex') {
      const vid = ctx.vertOrder()[pick.vertex];
      if (vid !== undefined) updateSelection([vid], mode);
      return;
    }
    if (pick.kind === 'edge' && component === 'edge') {
      const eid = ctx.edgeFromCompact(pick.edge[0], pick.edge[1]);
      if (eid !== null) updateSelection([eid], mode);
    }
  };

  const activePolygonIndices = (): number[] | null => {
    if (!active.isSet) return null;
    const out: number[] = [];
    ctx.faceOrder().forEach((kf, dense) => {
      if (active.faces.has(kf)) out.push(dense);
    });
    return out;
  };

  return { applyPick, clearSelection, activePolygonIndices };
}
