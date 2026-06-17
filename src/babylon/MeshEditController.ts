import type { Scene } from '@babylonjs/core/scene';
import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { PointerInfo } from '@babylonjs/core/Events/pointerEvents';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { UtilityLayerRenderer } from '@babylonjs/core/Rendering/utilityLayerRenderer';
import type { CustomGeometry } from '@/types';
import { EditableMesh, type ComponentMode } from './editmesh/EditableMesh';
import { runMeshOp, type MeshEditOp } from './editmesh/meshEditOps';
import { MeshEditOverlay, selectedVertexIndices } from './editmesh/MeshEditOverlay';
import type { SculptBrushParams } from '@/types';
import type { MeshEditTool } from '@/store/editorTypes';
import { selectAll, growSelection, shrinkSelection, edgeLoop, edgeRing, nearestComponentInFace, framingFor } from './editmesh/selectionOps';
import { MeshMarquee, componentsInRect } from './MeshMarquee';
import { MeshSculptSession } from './MeshSculptSession';
import { MeshComponentGizmo } from './MeshComponentGizmo';
import { MeshLoopCutSession } from './MeshLoopCutSession';
import { MeshKnifeSession } from './MeshKnifeSession';
import type { MeshToolHost, FacePick } from './MeshToolHost';
import { toCustomGeometry } from './customMesh';

export type { MeshEditOp } from './editmesh/meshEditOps';

/**
 * Drives Edit Mode for one entity's mesh: it converts the entity's geometry into an
 * {@link EditableMesh}, renders a live preview + component overlays, picks
 * vertices/edges/faces under the cursor, moves the selection with a gizmo, and runs
 * the modeling operators. Edits are committed back as {@link CustomGeometry} via the
 * `onCommit` callback (so they persist + undo as one step), mirroring SculptController.
 */
export class MeshEditController {
  private active = false;
  private edit?: EditableMesh;
  private entityId?: string;
  private component: ComponentMode = 'face';
  private selection = new Set<string>();
  /** Maps a preview triangle index → originating face index, for picking. */
  private triToFace: number[] = [];
  private preview?: Mesh;
  private overlay?: MeshEditOverlay;
  private root?: TransformNode;
  /** Translate gizmo for moving the selected vertices/edges/faces. */
  private readonly gizmo: MeshComponentGizmo;
  private previewMat?: StandardMaterial;
  private onSelectionChange?: (mode: ComponentMode, keys: string[]) => void;
  /** When set, pointer drags sculpt the mesh instead of selecting components. */
  private brush: SculptBrushParams | null = null;
  /** Free-form sculpting session (delegated pointer handling while a brush is active). */
  private readonly sculpt: MeshSculptSession;
  /** Interactive loop-cut session (active while `tool === 'loopcut'`). */
  private readonly loopCutSession: MeshLoopCutSession;
  /** Interactive knife session (active while `tool === 'knife'`). */
  private readonly knifeSession: MeshKnifeSession;
  /** Active interactive tool; while non-`select` it owns viewport pointer input. */
  private tool: MeshEditTool = 'select';
  /** Marquee box-select state. */
  private marquee: MeshMarquee;
  private marqueeArmed = false;
  private marqueeAdditive = false;
  private marqueeStart = { x: 0, y: 0 };
  /** Viewport "show surfaces" toggle — when false the solid preview is hidden so
   *  only the wireframe/component overlays remain (editing still works). */
  private showSurfaces = true;

  private onCommit?: (entityId: string, geo: CustomGeometry) => void;

  constructor(
    private readonly scene: Scene,
    private readonly camera: ArcRotateCamera,
    private readonly canvas: HTMLCanvasElement,
    private readonly getMesh: (entityId: string) => AbstractMesh | undefined,
  ) {
    this.marquee = new MeshMarquee(canvas);
    // One host object serves the sculpt brush + both interactive tools (structural typing
    // lets each take the subset it needs).
    const host: MeshToolHost & { getBrush(): SculptBrushParams | null } = {
      scene,
      camera,
      canvas,
      getEdit: () => this.edit,
      getPreview: () => this.preview,
      getRoot: () => this.root,
      getBrush: () => this.brush,
      rebuildPreview: () => this.rebuildPreview(),
      commit: () => this.commit(),
      pickFace: () => this.pickFace(),
    };
    this.sculpt = new MeshSculptSession(host);
    this.loopCutSession = new MeshLoopCutSession(host);
    this.knifeSession = new MeshKnifeSession(host);
    this.gizmo = new MeshComponentGizmo(
      scene,
      () => UtilityLayerRenderer.DefaultUtilityLayer,
      (d) => this.onGizmoDrag(d),
      () => this.commit(),
    );
  }

  /** Apply a gizmo drag delta to the selected vertices and refresh the preview. */
  private onGizmoDrag(d: { x: number; y: number; z: number }): void {
    if (!this.edit) return;
    const ids = selectedVertexIndices(this.edit, this.component, this.selection);
    this.edit.translateVertices(ids, d.x, d.y, d.z);
    this.rebuildPreview();
  }

  /** Raycast the preview surface under the cursor → hit face id + local-space point. */
  private pickFace(): FacePick | null {
    if (!this.edit || !this.preview) return null;
    const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (m) => m === this.preview, false, this.camera);
    if (!pick?.hit || pick.faceId < 0 || !pick.pickedPoint) return null;
    const faceId = this.triToFace[pick.faceId];
    if (faceId === undefined) return null;
    return { faceId, local: this.toLocal(pick.pickedPoint) };
  }

  isActive(): boolean {
    return this.active;
  }

  /** Where committed geometry is written back (→ store.commitMeshGeometry). */
  setOnCommit(cb: (entityId: string, geo: CustomGeometry) => void): void {
    this.onCommit = cb;
  }

  /** Notify the store/UI when the selection set changes (for panel display). */
  setOnSelectionChange(cb: (mode: ComponentMode, keys: string[]) => void): void {
    this.onSelectionChange = cb;
  }

  /** Enter/exit Edit Mode for an entity. On enter, the source mesh is hidden and a
   *  working preview is shown; on exit the geometry is committed and cleaned up. The
   *  optional `geo` (the entity's stored custom geometry) is preferred over reading the
   *  GPU mesh, so persisted polygon topology re-opens as quads. */
  setTarget(active: boolean, entityId: string | null, geo?: CustomGeometry | null): void {
    if (active && entityId && this.getMesh(entityId)) {
      this.begin(entityId, geo ?? undefined);
    } else {
      this.end();
    }
  }

  setComponentMode(mode: ComponentMode): void {
    if (this.component === mode) return;
    this.component = mode;
    this.selection.clear();
    this.refreshOverlay();
    this.detachGizmo();
    this.emitSelection();
  }

  private begin(entityId: string, geo?: CustomGeometry): void {
    this.end();
    const src = this.getMesh(entityId);
    if (!src) return;
    // Prefer stored geometry (carries polygon topology) over the triangulated GPU mesh.
    this.edit = EditableMesh.fromGeometry(geo ?? toCustomGeometry(src));
    this.entityId = entityId;
    this.active = true;
    this.selection.clear();

    this.root = new TransformNode('meshedit-root', this.scene);
    // Match the source object's world transform so editing happens in place.
    this.root.position.copyFrom(src.position);
    this.root.rotationQuaternion = src.rotationQuaternion?.clone() ?? null;
    if (!this.root.rotationQuaternion) this.root.rotation.copyFrom(src.rotation);
    this.root.scaling.copyFrom(src.scaling);
    src.setEnabled(false);

    this.previewMat = new StandardMaterial('meshedit-preview', this.scene);
    this.previewMat.diffuseColor = Color3.FromHexString('#8a93a6');
    this.previewMat.backFaceCulling = false;

    this.overlay = new MeshEditOverlay(this.scene, this.root);
    this.rebuildPreview();
    this.camera.attachControl(this.canvas, true);
  }

  private end(): void {
    if (this.active && this.entityId && this.edit) {
      this.onCommit?.(this.entityId, this.edit.toGeometry());
      this.getMesh(this.entityId)?.setEnabled(true);
    }
    this.sculpt.reset();
    this.loopCutSession.reset();
    this.knifeSession.reset();
    this.tool = 'select';
    // Dispose the gizmo before the root it parents to is torn down below.
    this.gizmo.dispose();
    this.overlay?.dispose();
    this.preview?.dispose();
    this.previewMat?.dispose();
    this.root?.dispose();
    this.overlay = undefined;
    this.preview = undefined;
    this.previewMat = undefined;
    this.root = undefined;
    this.edit = undefined;
    this.entityId = undefined;
    this.active = false;
    this.brush = null;
    this.selection.clear();
  }

  /** Rebuild the preview mesh + the triangle→face map, then refresh overlays.
   *  When only vertex positions moved (same topology — the common case during a
   *  gizmo drag or sculpt stroke) the existing mesh's buffers are updated in place
   *  rather than disposed and recreated. The old dispose+recreate-every-frame path
   *  left the surface unrendered for the duration of a drag; updating in place keeps
   *  it always visible.
   *
   *  Each triangle gets its own vertices carrying its face's flat normal — the same
   *  hard-surface shading {@link EditableMesh.toGeometry} bakes. Sharing vertices and
   *  letting ComputeNormals average them (the previous approach) smooth-shades the
   *  surface, which makes every quad's fan-triangulation diagonal show up as a crease —
   *  i.e. the mesh *looks* triangulated even though the topology is still quads. */
  private rebuildPreview(): void {
    if (!this.edit || !this.root) return;
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    this.triToFace = [];
    // Faces are fan-triangulated in the same order EditableMesh.triangulate uses,
    // so we can recover the source face of each triangle for picking. Vertices are
    // not shared between triangles, so a face shades flat (no visible diagonals).
    this.edit.faces.forEach((loop, faceId) => {
      const n = this.edit!.faceNormal(faceId);
      for (let i = 1; i < loop.length - 1; i++) {
        for (const vi of [loop[0], loop[i], loop[i + 1]]) {
          const v = this.edit!.vertices[vi];
          const base = positions.length / 3;
          positions.push(v.x, v.y, v.z);
          normals.push(n.x, n.y, n.z);
          indices.push(base);
        }
        this.triToFace.push(faceId);
      }
    });

    // Fast path: topology unchanged → update the live mesh's buffers (no dispose).
    const vertCount = positions.length / 3;
    const existing = this.preview;
    if (
      existing &&
      !existing.isDisposed() &&
      existing.getTotalVertices() === vertCount &&
      (existing.getIndices()?.length ?? -1) === indices.length
    ) {
      existing.updateVerticesData(VertexBuffer.PositionKind, positions);
      existing.updateVerticesData(VertexBuffer.NormalKind, normals);
      existing.refreshBoundingInfo();
      this.refreshOverlay();
      return;
    }

    // Slow path: topology changed (operators add/remove geometry) → rebuild.
    this.preview?.dispose();
    const mesh = new Mesh('meshedit-preview', this.scene);
    const vd = new VertexData();
    vd.positions = positions;
    vd.indices = indices;
    vd.normals = normals;
    vd.applyToMesh(mesh, true);
    mesh.material = this.previewMat!;
    mesh.parent = this.root;
    mesh.setEnabled(this.showSurfaces);
    this.preview = mesh;
    this.refreshOverlay();
  }

  /** Show/hide the solid surface preview (viewport "show surfaces" toggle). The
   *  component overlays and gizmo stay live so editing continues to work. */
  setShowSurfaces(on: boolean): void {
    this.showSurfaces = on;
    this.preview?.setEnabled(on);
  }

  private refreshOverlay(): void {
    if (this.edit) this.overlay?.rebuild(this.edit, this.component, this.selection);
  }

  /** Activate/deactivate a sculpt brush. While a brush is set, pointer drags sculpt
   *  the mesh (camera rotation is detached during a stroke), like SculptController. */
  setSculptBrush(brush: SculptBrushParams | null): void {
    this.brush = brush;
    if (brush) {
      this.setTool('select'); // brush + interactive tools are mutually exclusive
      this.detachGizmo();
    }
  }

  /** Switch the active interactive tool (loop cut / knife), or 'select' to return to
   *  normal component editing. Resets any in-progress tool state + the gizmo. */
  setTool(tool: MeshEditTool): void {
    if (this.tool === tool) return;
    this.loopCutSession.reset();
    this.knifeSession.reset();
    this.tool = tool;
    if (tool !== 'select') {
      this.brush = null;
      this.detachGizmo();
      this.selection.clear();
      this.refreshOverlay();
      this.emitSelection();
    }
  }

  /** Route a scene pointer event. Returns true when Edit Mode consumed it. */
  routePointer(info: PointerInfo): boolean {
    if (!this.active) return false;
    if (this.brush) return this.sculpt.route(info);
    const e = info.event as PointerEvent;
    if (e.altKey) return true; // Alt+drag is camera navigation (Maya scheme)
    if (this.tool === 'loopcut') return this.loopCutSession.route(info);
    if (this.tool === 'knife') return this.knifeSession.route(info);
    if (this.gizmo.dragging) return true; // a component gizmo owns the drag
    if (e.button === 2) return this.active;

    if (info.type === 1 /* DOWN */ && e.button === 0) {
      const key = this.componentKeyAtPointer();
      if (key !== null) {
        this.toggleSelect(key, e.shiftKey);
        this.marqueeArmed = false;
      } else {
        // Empty space → arm a marquee (drag) or a deselect (click).
        this.marqueeArmed = true;
        this.marqueeAdditive = e.shiftKey;
        this.marqueeStart = { x: e.clientX, y: e.clientY };
      }
    } else if (info.type === 4 /* MOVE */ && this.marqueeArmed && !this.gizmo.dragging) {
      if (!this.marquee.isActive() && Math.hypot(e.clientX - this.marqueeStart.x, e.clientY - this.marqueeStart.y) > 6) {
        this.marquee.begin(this.marqueeStart.x, this.marqueeStart.y);
      }
      if (this.marquee.isActive()) this.marquee.update(e.clientX, e.clientY);
    } else if (info.type === 2 /* UP */) {
      if (this.marquee.isActive()) {
        this.boxSelect(this.marqueeAdditive);
        this.marquee.end();
      } else if (this.marqueeArmed && !this.marqueeAdditive) {
        this.selection.clear();
        this.afterSelectionChange();
      }
      this.marqueeArmed = false;
    }
    return true;
  }

  /** The component key under the cursor (vertex/edge/face), or null on empty space. */
  private componentKeyAtPointer(): string | null {
    if (!this.edit || !this.preview) return null;
    const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (m) => m === this.preview, false, this.camera);
    if (!pick?.hit || pick.faceId < 0) return null;
    const faceId = this.triToFace[pick.faceId];
    if (faceId === undefined) return null;
    return this.componentKeyAt(faceId, this.toLocal(pick.pickedPoint!));
  }

  /** Toggle a component key into the selection (replacing it unless additive). */
  private toggleSelect(key: string, additive: boolean): void {
    if (!additive) this.selection.clear();
    if (this.selection.has(key)) this.selection.delete(key);
    else this.selection.add(key);
    this.afterSelectionChange();
  }

  /** Select every component whose screen projection falls inside the marquee rect. */
  private boxSelect(additive: boolean): void {
    const rect = this.marquee.rect();
    if (!this.edit || !this.root || !rect) return;
    if (!additive) this.selection.clear();
    const keys = componentsInRect(this.edit, this.component, rect, this.root.getWorldMatrix(), this.scene, this.camera, this.canvas);
    for (const k of keys) this.selection.add(k);
    this.afterSelectionChange();
  }

  // ---- selection operators (driven from the tools panel / hotkeys) ----------
  selectAllComponents(): void {
    if (this.edit) this.setSelection(selectAll(this.edit, this.component));
  }
  growSelection(): void {
    if (this.edit) this.setSelection(growSelection(this.edit, this.component, this.selection));
  }
  shrinkSelection(): void {
    if (this.edit) this.setSelection(shrinkSelection(this.edit, this.component, this.selection));
  }
  selectEdgeLoop(): void {
    const seed = [...this.selection][0];
    if (this.edit && this.component === 'edge' && seed) this.setSelection(edgeLoop(this.edit, seed));
  }
  selectEdgeRing(): void {
    const seed = [...this.selection][0];
    if (this.edit && this.component === 'edge' && seed) this.setSelection(edgeRing(this.edit, seed));
  }
  private setSelection(sel: Set<string>): void {
    this.selection = sel;
    this.afterSelectionChange();
  }

  /** Frame the editor camera on the current selection (or the whole mesh if empty). */
  frameSelection(): void {
    if (!this.edit || !this.root) return;
    const ids = this.selection.size ? selectedVertexIndices(this.edit, this.component, this.selection) : this.edit.vertices.map((_, i) => i);
    const framing = framingFor(this.edit, ids);
    if (!framing) return;
    const c = framing.center;
    const world = Vector3.TransformCoordinates(new Vector3(c.x, c.y, c.z), this.root.getWorldMatrix());
    this.camera.setTarget(world);
    this.camera.radius = Math.max(framing.radius * 3, 2);
  }

  private afterSelectionChange(): void {
    this.refreshOverlay();
    this.attachGizmoToSelection();
    this.emitSelection();
  }

  /** Convert a world-space hit into the root-local space the EditableMesh lives in. */
  private toLocal(world: Vector3): Vector3 {
    if (!this.root) return world;
    const inv = this.root.getWorldMatrix().clone().invert();
    return Vector3.TransformCoordinates(world, inv);
  }

  /** The selection key for the component nearest `local` within the picked face. */
  private componentKeyAt(faceId: number, local: Vector3): string | null {
    return this.edit ? nearestComponentInFace(this.edit, this.component, faceId, local) : null;
  }

  // ---- gizmo-driven component translation ----------------------------------

  private attachGizmoToSelection(): void {
    if (!this.edit || !this.root || this.selection.size === 0) {
      this.detachGizmo();
      return;
    }
    const ids = selectedVertexIndices(this.edit, this.component, this.selection);
    if (ids.length === 0) {
      this.detachGizmo();
      return;
    }
    const c = { x: 0, y: 0, z: 0 };
    for (const id of ids) {
      const v = this.edit.vertices[id];
      c.x += v.x;
      c.y += v.y;
      c.z += v.z;
    }
    const n = ids.length;
    this.gizmo.attach({ x: c.x / n, y: c.y / n, z: c.z / n }, this.root);
  }

  private detachGizmo(): void {
    this.gizmo.detach();
  }

  // ---- modeling operators --------------------------------------------------

  /** Run a modeling operator against the current selection, then commit. */
  applyOp(op: MeshEditOp, amount = 0): void {
    if (!this.edit) return;
    const reselect = runMeshOp(this.edit, op, this.component, this.selection, amount);
    if (reselect) this.selectFaces(reselect);
    this.rebuildPreview();
    this.attachGizmoToSelection();
    this.emitSelection();
    this.commit();
  }

  private selectFaces(ids: number[]): void {
    this.selection = new Set(ids.map(String));
  }

  /** Spawn a fresh editable primitive in place of the current mesh. */
  loadGeometry(geo: CustomGeometry): void {
    this.edit = EditableMesh.fromGeometry(geo);
    this.selection.clear();
    this.rebuildPreview();
    this.detachGizmo();
    this.emitSelection();
  }

  /** Write the current geometry back to the store (undoable as one edit). */
  commit(): void {
    if (this.active && this.entityId && this.edit) this.onCommit?.(this.entityId, this.edit.toGeometry());
  }

  private emitSelection(): void {
    this.onSelectionChange?.(this.component, [...this.selection]);
  }
}
