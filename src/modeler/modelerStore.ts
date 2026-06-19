import { create } from 'zustand';
import type { CustomGeometry } from '@/types';
import { HalfEdgeMesh } from '@/kernel/HalfEdgeMesh';
import { buildPrimitive, type KernelPrimitive } from '@/kernel/primitives';
import { toGeometry, fromGeometry } from '@/kernel/render';
import { CommandStack, snapshotCommand } from '@/kernel/commands';
import { extrudeFaces } from '@/kernel/operations/extrude';
import { loopOrPath, edgeLoop, type Comp } from '@/kernel/selectionOps';
import { ActiveObject } from './modelerFocus';
import { ObjectGroups } from './modelerGroups';
import { createPickActions, type PickCtx } from './modelerPicking';
import type { KnifePoint } from '@/kernel/operations/knife';
import { createEditActions, type Clip, type EditActionsCtx } from './modelerEditActions';
import { createTransformActions } from './modelerTransformActions';
import { createInspectorActions } from './modelerInspectorActions';
import { createAssetActions } from './modelerAssetActions';
import { createMeshActions, type MeshActions } from './modelerMeshActions';
import { defaultStudioEnv, type StudioEnv } from './modelerEnvironment';
import { useEditorStore } from '@/store/editorStore';
import type { KeymapId } from '@/input/keymaps';
import type { ModelerPick } from './ModelerScene';

/** Transform tool active in the modeling viewport. */
export type ModelerTool = 'select' | 'move' | 'rotate' | 'scale';

/** An interactive mesh-editing tool that takes over viewport input, or 'none'. */
export type EditTool = 'none' | 'loopcut' | 'knife' | 'drawpoly' | 'sketchtopo';

/**
 * What the selection/transform acts on: the whole object, or its vertex / edge / face
 * components. Switched with the 1/2/3/4 keys (object/vertex/edge/face). Object mode lets
 * you select and transform the entire model; the component modes edit its topology.
 */
export type ComponentMode = 'object' | 'vertex' | 'edge' | 'face';

/**
 * State for the 3D Modeling Studio. The half-edge {@link HalfEdgeMesh} kernel is the
 * source of truth for the model; every edit runs as a reversible {@link CommandStack}
 * command, then bakes render geometry for the viewport (Babylon only renders). This is
 * intentionally separate from the game `editorStore` — no scene entities, scripts, or
 * play state. The baked geometry is mirrored into the project's single mesh entity so it
 * persists through the existing save system.
 */
export interface ModelerState extends MeshActions {
  /** Baked render geometry (kernel → Babylon). Replaced on every edit. */
  geometry: CustomGeometry;
  /**
   * Selected component ids — kernel indices whose meaning depends on {@link component}:
   * face ids in 'face' mode, vertex ids in 'vertex' mode, edge ids in 'edge' mode, and the
   * faces of the selected island(s) in 'object' mode.
   */
  selection: number[];
  /** Active component mode (object / vertex / edge / face) driven by the 1–4 keys. */
  component: ComponentMode;
  /** Whether any object (island) is selected in object mode — kept in sync with `selection`. */
  objectSelected: boolean;
  /** Whether an object (or group) is currently focused — the one component editing locks to.
   *  Set by selecting an object in object mode; required before entering an edit mode. */
  hasActiveObject: () => boolean;
  /** Switch component mode; clears the current selection. Entering an edit mode (vertex/edge/
   *  face) requires a focused object — without one the switch is a no-op, so editing is always
   *  scoped to a single object you selected first. */
  setComponent: (component: ComponentMode) => void;
  /** Bumped when geometry changes (drives viewport rebuild). */
  revision: number;
  /** Bumped when the selection changes (drives highlight refresh). */
  selRevision: number;
  /** Bumped when the focused (active) object changes (drives the dim/lock overlay). */
  activeRevision: number;
  /** Dense polygon indices of the focused object, or null when nothing is focused (= all
   *  objects active/pickable). Drives the viewport's dim + pick-lock. */
  activePolygonIndices: () => number[] | null;
  faceCount: number;
  canUndo: boolean;
  canRedo: boolean;
  /** Active transform tool (drives which gizmo shows). */
  tool: ModelerTool;
  /** Active keyboard layout for the modeling tools. */
  keymap: KeymapId;
  /** Whether the wireframe edge overlay is drawn on the model. */
  showWireframe: boolean;
  /** Whether transform gizmo drags snap to grid increments (viewport magnet toggle). */
  snapToGrid: boolean;
  /** Active interactive edit tool (loop cut / knife), or 'none' for normal select/gizmo. */
  editTool: EditTool;
  /** Studio-only viewport preview (env/IBL, key/fill lights, tone, lit toggle); not the game. */
  studioEnv: StudioEnv;
  /** Patch the Studio viewport preview settings (environment / lighting / tone / lit preview). */
  setStudioEnv: (patch: Partial<StudioEnv>) => void;
  /** Export the focused object (island) to the asset library; returns its asset id, or null. */
  makeSelectedObjectAsset: () => string | null;
  /** Remove the focused object's library asset + its link. */
  removeSelectedObjectAsset: () => void;
  /** The asset id the focused object is linked to (drives the "Make asset" toggle), or null. */
  selectedObjectAssetId: () => string | null;
  /** Whether the focused object's asset is a reference/proxy (instances re-sync on load). */
  selectedObjectIsReference: () => boolean;
  /** Toggle the focused object's asset between reference (linked instances) and copy. */
  setSelectedObjectReference: (on: boolean) => void;
  /** Re-extract every exported object and update its asset in place (call on save) so edits to
   *  the source propagate to the asset and its linked instances. */
  republishLinkedObjects: () => void;
  setTool: (tool: ModelerTool) => void;
  /** Activate/clear an interactive edit tool; toggling the active one returns to 'none'. */
  setEditTool: (tool: EditTool) => void;
  setKeymap: (id: KeymapId) => void;
  toggleWireframe: () => void;
  toggleSnapToGrid: () => void;
  /** Bumped to ask the viewport to frame the camera on the model. */
  frameRequest: number;
  requestFrame: () => void;

  /** Load the kernel from the project's mesh entity (or a default cube). */
  init: () => void;
  /** Add a fresh primitive to the model (a new island beside the current geometry). */
  addPrimitive: (kind: KernelPrimitive) => void;
  /** Group the selected objects so they focus/select/transform as one (object mode, ≥2 objects). */
  group: () => void;
  /** Ungroup the selected object back into its constituent islands (object mode). */
  ungroup: () => void;
  /** Whether the current object-mode selection spans a group (drives Ungroup enablement). */
  selectionGrouped: () => boolean;
  /** Toggle a picked face (by polygon index) into the selection. */
  pickFace: (polygonIndex: number | null, additive: boolean) => void;
  /** Apply a viewport pick per the active component mode. `additive` (Shift) adds to the
   *  selection, `subtract` (Ctrl/Cmd) removes from it, neither replaces. Object-mode picks
   *  select the clicked island (connected component), not the whole model. */
  applyPick: (pick: ModelerPick, additive?: boolean, subtract?: boolean, loop?: boolean) => void;
  clearSelection: () => void;
  /** Extrude the selected faces along their averaged normal. */
  extrude: (distance?: number) => void;
  /** Connect the selected vertices with new edges, splitting the shared faces (vertex mode). */
  connect: () => void;
  /** Bridge the two selected edge loops with a band of quads (edge mode). */
  bridge: () => void;
  /** Preview the loop a cut through a compacted edge [a,b] at slide ratio `t` (0..1, default
   *  0.5) would insert (model-space segments). */
  loopCutPreview: (compactEdge: [number, number] | null, t?: number) => Array<[V3, V3]>;
  /** Commit a loop cut through a compacted edge [a,b] at slide ratio `t` (0..1, default 0.5). */
  loopCutCommit: (compactEdge: [number, number], t?: number) => void;
  /** Commit a knife path (compacted edge points). Returns true if a cut was made. */
  knifeCommit: (path: KnifePoint[]) => boolean;
  /** Commit a draw-poly path (model-space points) as a new face. Returns true on success. */
  drawPolyCommit: (points: V3[]) => boolean;
  /** Grid resolution R for sketch-retopo patches (every patch is an R×R quad grid). */
  retopoResolution: number;
  setRetopoResolution: (r: number) => void;
  /** Replace the mesh with a sketch-retopo quad cage (welded verts + quad face loops). */
  sketchTopoCommit: (verts: V3[], faces: number[][]) => void;
  /** Delete the current selection per component mode (faces / verts / edges / object). */
  deleteSelection: () => void;
  /** Duplicate the selected faces (or whole object) in place; re-selects the copies. */
  duplicateSelection: () => void;
  /** Copy the selected faces (or whole object) to the modeler clipboard. */
  copySelection: () => void;
  /** Paste the clipboard faces into the mesh; re-selects them. */
  paste: () => void;
  /** Whether the clipboard currently holds geometry (drives Paste enablement). */
  canPaste: () => boolean;
  /** Add a face from the selected vertices (vertex mode, ≥3). */
  addFaceFromSelection: () => void;
  /** Add a vertex at the midpoint of each selected edge (edge mode). */
  addVertexOnEdges: () => void;
  undo: () => void;
  redo: () => void;
  /** Polygon indices to highlight: the selected faces (object mode = the selected island). */
  selectionPolygons: () => number[];
  /** Compacted vertex indices to highlight (vertex mode only). */
  selectionVerticesCompact: () => number[];
  /** Compacted edge endpoint pairs to highlight (edge mode only). */
  selectionEdgesCompact: () => Array<[number, number]>;
  /** World centroid of the active selection's vertices, or null when nothing is selected. */
  selectionCentroid: () => [number, number, number] | null;
  /** Centroid + axis-aligned size of the active selection (count 0 when nothing is selected).
   *  Drives the Inspector's numeric Position/Dimensions fields. */
  selectionBounds: () => import('./selectionBounds').SelectionBounds;
  /** Set the selection's centroid on one axis (absolute position); one undoable step. */
  setSelectionCenter: (axis: import('./modelerInspectorActions').InspectorAxis, value: number) => void;
  /** Set the selection's bounding-box extent on one axis (absolute size, scaled about its
   *  centroid); one undoable step. Ignored for a zero-extent axis. */
  setSelectionDimension: (axis: import('./modelerInspectorActions').InspectorAxis, value: number) => void;
  /** Rotate the selection about its centroid by an euler delta (degrees); one undoable step. */
  nudgeSelectionRotation: (eulerDeg: { x: number; y: number; z: number }) => void;
  /** Begin a gizmo drag (snapshots the mesh so the whole drag is one undo step). */
  beginTransform: () => void;
  /** Move the selected faces' vertices by a delta during a gizmo drag (no command yet). */
  translateSelectionLive: (dx: number, dy: number, dz: number) => void;
  /** Rotate the selected vertices by a delta quaternion about a pivot (live). */
  rotateSelectionLive: (q: { x: number; y: number; z: number; w: number }, pivot: [number, number, number]) => void;
  /** Scale the selected vertices about a pivot (live). */
  scaleSelectionLive: (sx: number, sy: number, sz: number, pivot: [number, number, number]) => void;
  /** End a gizmo drag — commit the net move as a single undoable command. */
  endTransform: () => void;
}

// Kernel + command stack live outside the reactive state (they're mutable instances).
let mesh = new HalfEdgeMesh();
/** The focused object — component picking/editing locks to it; see {@link ActiveObject}. */
const active = new ActiveObject();
/** Object groups — grouped islands focus/select as one; see {@link ObjectGroups}. */
const groups = new ObjectGroups();
let faceOrder: number[] = [];
// Compaction maps mirroring `toGeometry` so the viewport (which works in dense, compacted
// indices) and the kernel (sparse ids) can be translated for vertex/edge picking + highlight.
let vertOrder: number[] = []; // compacted index → kernel vertex id
let vertCompact = new Map<number, number>(); // kernel vertex id → compacted index
let edgeByPair = new Map<string, number>(); // "min_max" kernel vertex pair → kernel edge id
const stack = new CommandStack();
/** Copied face geometry (positions + local-index loops), for Copy/Paste. */
let clipboard: Clip | null = null;

/** Order-independent key for an undirected vertex pair. */
const pairKey = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);

/** Unique vertex ids touched by a set of faces. */
function verticesOfFaces(m: HalfEdgeMesh, faceIds: number[]): number[] {
  const set = new Set<number>();
  for (const f of faceIds) for (const v of m.faceVertices(f)) set.add(v);
  return [...set];
}

/** Rebuild the compaction maps from the current kernel mesh (matches `toGeometry`). */
function refreshMaps(m: HalfEdgeMesh): void {
  faceOrder = m.liveFaces();
  vertOrder = [];
  vertCompact = new Map();
  m.vertices.forEach((v, i) => {
    if (v.removed) return;
    vertCompact.set(i, vertOrder.length);
    vertOrder.push(i);
  });
  edgeByPair = new Map();
  for (const e of m.liveEdges()) {
    const [a, b] = m.edgeVertices(e);
    edgeByPair.set(pairKey(a, b), e);
  }
}

/** Translate a compacted edge (two dense vertex indices) to its kernel edge id, or null. */
function kernelEdgeFromCompact(a: number, b: number): number | null {
  const ka = vertOrder[a];
  const kb = vertOrder[b];
  if (ka === undefined || kb === undefined) return null;
  return edgeByPair.get(pairKey(ka, kb)) ?? null;
}

/** The project entity whose geometry mirrors the model (for persistence). */
function projectMeshEntityId(): string | null {
  const e = useEditorStore.getState().entities.find((en) => en.mesh);
  return e?.id ?? null;
}

export const useModelerStore = create<ModelerState>((set, get) => {
  /** Re-bake geometry + compaction maps from the kernel and bump the revision. */
  const rebuild = () => {
    refreshMaps(mesh);
    groups.refresh(mesh); // re-sync group membership before the focus, which may read it
    active.refresh(mesh); // re-identify the focused island after ids were reassigned
    set((s) => ({ geometry: toGeometry(mesh), revision: s.revision + 1, activeRevision: s.activeRevision + 1, faceCount: faceOrder.length, canUndo: stack.canUndo(), canRedo: stack.canRedo() }));
  };
  /** Kernel vertex ids the active selection resolves to (drives transforms + centroid). */
  const selectedVertices = (): number[] => {
    const { component, selection } = get();
    // Object mode now selects islands (face sets), like face mode — not the whole mesh.
    if (component === 'object' || component === 'face') return verticesOfFaces(mesh, selection);
    if (component === 'vertex') return selection.filter((v) => mesh.vertices[v] && !mesh.vertices[v].removed);
    // edge: union of both endpoints of each selected edge
    const verts = new Set<number>();
    for (const e of selection) {
      if (mesh.edges[e] && !mesh.edges[e].removed) {
        const [a, b] = mesh.edgeVertices(e);
        verts.add(a);
        verts.add(b);
      }
    }
    return [...verts];
  };
  /** Persist the baked geometry into the project's mesh entity (so save() captures it). */
  const sync = () => {
    const id = projectMeshEntityId();
    if (id) useEditorStore.getState().commitMeshGeometry(id, get().geometry);
  };
  /** Shared context for the extracted edit/mesh action factories. */
  const editCtx: EditActionsCtx = {
    mesh: () => mesh, stack, get, set, rebuild, sync,
    faceOrder: () => faceOrder, selectedVertices, kernelEdgeFromCompact,
    getClipboard: () => clipboard, setClipboard: (c) => { clipboard = c; },
  };
  const pickCtx: PickCtx = {
    get, set, mesh: () => mesh, active, groups,
    vertOrder: () => vertOrder, faceOrder: () => faceOrder, edgeFromCompact: kernelEdgeFromCompact,
  };

  return {
    geometry: { positions: [], indices: [], normals: [] },
    selection: [],
    component: 'object',
    objectSelected: false,
    revision: 0,
    selRevision: 0,
    activeRevision: 0,
    faceCount: 0,
    canUndo: false,
    canRedo: false,
    tool: 'move',
    editTool: 'none',
    keymap: 'maya',
    showWireframe: true,
    snapToGrid: false,
    studioEnv: defaultStudioEnv(),
    retopoResolution: 4,
    frameRequest: 0,

    setTool: (tool) => set({ tool }),
    setRetopoResolution: (r) => set({ retopoResolution: Math.max(1, Math.min(16, Math.round(r))) }),
    // Tools own viewport input; activating one drops the selection (detaches the gizmo).
    setEditTool: (tool) =>
      set((s) => ({ editTool: s.editTool === tool ? 'none' : tool, selection: [], objectSelected: false, selRevision: s.selRevision + 1 })),
    hasActiveObject: () => active.isSet,
    setComponent: (component) =>
      set((s) => {
        // Edit modes (vertex/edge/face) act on the focused object, so one must be selected
        // first (in object mode). Without a focused object the switch is ignored — you can't
        // drop into an edit mode against "nothing". Object mode is always reachable.
        if (component !== 'object' && !active.isSet) return {};
        return { component, selection: [], objectSelected: false, selRevision: s.selRevision + 1 };
      }),
    setStudioEnv: (patch) => {
      const studioEnv = { ...get().studioEnv, ...patch };
      set({ studioEnv });
      // Mirror into the project design doc so it persists with the project (and marks it dirty).
      useEditorStore.getState().updateDesign({ studioEnv });
    },
    setKeymap: (id) => set({ keymap: id }),
    toggleWireframe: () => set((s) => ({ showWireframe: !s.showWireframe })),
    toggleSnapToGrid: () => set((s) => ({ snapToGrid: !s.snapToGrid })),
    requestFrame: () => set((s) => ({ frameRequest: s.frameRequest + 1 })),

    init: () => {
      const d = useEditorStore.getState();
      const ent = d.entities.find((e) => e.mesh);
      const custom = ent?.mesh?.custom;
      mesh = custom ? fromGeometry(custom) : buildPrimitive('cube', 2);
      stack.clear();
      active.clear(); // nothing focused until the user picks an object
      groups.clear();
      // Restore the persisted Studio viewport preview (env/lights/tone) from the project design.
      set((s) => ({ selection: [], objectSelected: false, studioEnv: d.design?.studioEnv ?? s.studioEnv }));
      rebuild();
    },

    addPrimitive: (kind) => {
      stack.run(snapshotCommand(mesh, `Add ${kind}`, () => appendPrimitive(mesh, kind)));
      set((s) => ({ selection: [], objectSelected: false }));
      rebuild();
      sync();
    },

    pickFace: (polygonIndex, additive) => {
      if (polygonIndex === null) {
        if (!additive) set((s) => ({ selection: [], selRevision: s.selRevision + 1 }));
        return;
      }
      const faceId = faceOrder[polygonIndex];
      if (faceId === undefined) return;
      set((s) => {
        const has = s.selection.includes(faceId);
        const selection = additive
          ? has
            ? s.selection.filter((f) => f !== faceId)
            : [...s.selection, faceId]
          : has && s.selection.length === 1
            ? []
            : [faceId];
        return { selection, selRevision: s.selRevision + 1 };
      });
    },

    ...createPickActions(pickCtx),

    group: () => {
      const faces = get().selection;
      if (get().component !== 'object' || faces.length === 0) return;
      groups.group(mesh, faces);
      active.setIslands(mesh, groups.islandsForFocus(mesh, faces[0])); // focus the new group
      set((s) => ({ activeRevision: s.activeRevision + 1 }));
    },
    ungroup: () => {
      const faces = get().selection;
      if (get().component !== 'object' || faces.length === 0) return;
      groups.ungroup(mesh, faces);
      active.setFromFace(mesh, faces[0]); // collapse focus back to the single clicked island
      set((s) => ({ activeRevision: s.activeRevision + 1 }));
    },
    selectionGrouped: () => get().selection.length > 0 && groups.isGrouped(mesh, get().selection[0]),

    extrude: (distance = 0.5) => {
      const faces = get().selection;
      if (faces.length === 0) return;
      let caps: number[] = [];
      stack.run(snapshotCommand(mesh, 'Extrude', () => {
        caps = extrudeFaces(mesh, faces, distance);
      }));
      set({ selection: caps });
      rebuild();
      sync();
    },

    ...createEditActions(editCtx),
    ...createMeshActions(editCtx),

    undo: () => {
      stack.undo();
      set((s) => ({ selection: [], objectSelected: false }));
      rebuild();
      sync();
    },
    redo: () => {
      stack.redo();
      set((s) => ({ selection: [], objectSelected: false }));
      rebuild();
      sync();
    },

    selectionPolygons: () => {
      const { component, selection } = get();
      // Object + face modes highlight the selected faces (object = the picked island).
      if (component === 'object' || component === 'face') return selection.map((faceId) => faceOrder.indexOf(faceId)).filter((i) => i >= 0);
      return [];
    },

    selectionVerticesCompact: () => {
      if (get().component !== 'vertex') return [];
      return get().selection.map((vid) => vertCompact.get(vid)).filter((i): i is number => i !== undefined);
    },

    selectionEdgesCompact: () => {
      if (get().component !== 'edge') return [];
      const out: Array<[number, number]> = [];
      for (const e of get().selection) {
        if (!mesh.edges[e] || mesh.edges[e].removed) continue;
        const [a, b] = mesh.edgeVertices(e);
        const ca = vertCompact.get(a);
        const cb = vertCompact.get(b);
        if (ca !== undefined && cb !== undefined) out.push([ca, cb]);
      }
      return out;
    },

    selectionCentroid: () => {
      const vids = selectedVertices();
      if (vids.length === 0) return null;
      let x = 0;
      let y = 0;
      let z = 0;
      for (const v of vids) {
        const p = mesh.vertices[v].position;
        x += p[0];
        y += p[1];
        z += p[2];
      }
      return [x / vids.length, y / vids.length, z / vids.length];
    },

    ...createTransformActions(editCtx),
    ...createInspectorActions(editCtx),
    ...createAssetActions(editCtx),
  };
});

type V3 = import('@/kernel/HalfEdgeMesh').V3;

/** Positions + faces for a fresh primitive (as a polygon soup). */
function primitiveData(kind: KernelPrimitive): [V3[], number[][]] {
  const m = buildPrimitive(kind, 2);
  const verts = m.vertices.map((v) => [...v.position] as V3);
  const faces = m.liveFaces().map((f) => m.faceVertices(f));
  return [verts, faces];
}

/**
 * Add a primitive to the model as a new, separate island rather than replacing it: the
 * existing geometry is kept, and the new primitive is placed just to the right of the
 * current bounding box so it lands beside what's there. (A single kernel mesh can hold
 * several disconnected components; per-object management is a later addition.)
 */
function appendPrimitive(target: HalfEdgeMesh, kind: KernelPrimitive): void {
  const cur = toGeometry(target);
  const curVerts: V3[] = [];
  for (let i = 0; i < (cur.polyVerts?.length ?? 0); i += 3) {
    curVerts.push([cur.polyVerts![i], cur.polyVerts![i + 1], cur.polyVerts![i + 2]]);
  }
  const curFaces = cur.polygons ?? [];
  const [nVerts, nFaces] = primitiveData(kind);

  // Offset the newcomer to sit beside the current model (its right edge + a gap).
  let dx = 0;
  if (curVerts.length) {
    const maxX = Math.max(...curVerts.map((v) => v[0]));
    const newMinX = Math.min(...nVerts.map((v) => v[0]));
    dx = maxX - newMinX + 1; // 1-unit gap between bounding boxes
  }
  const placed = nVerts.map((v) => [v[0] + dx, v[1], v[2]] as V3);
  const base = curVerts.length;
  const faces = [...curFaces, ...nFaces.map((f) => f.map((i) => i + base))];
  target.buildFromPolygons([...curVerts, ...placed], faces);
}
