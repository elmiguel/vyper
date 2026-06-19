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
import type { CustomGeometry, SculptBrushParams } from '@/types';
import type { MeshEditTool } from '@/store/editorTypes';
import { EditableMesh, type ComponentMode } from './editmesh/EditableMesh';
import { runMeshOp, type MeshEditOp } from './editmesh/meshEditOps';
import { MeshMarquee, componentsInRect } from './MeshMarquee';
import { MeshSculptSession } from './MeshSculptSession';
import { MeshComponentGizmo } from './MeshComponentGizmo';
import { MeshLoopCutSession } from './MeshLoopCutSession';
import { MeshKnifeSession } from './MeshKnifeSession';
import type { MeshToolHost, FacePick } from './MeshToolHost';
import { toCustomGeometry } from './customMesh';
import { EDITOR_LAYER } from './editorObjects';
import { KernelEditSession, type EditComponent, type EditPick } from './editmesh/KernelEditSession';
import {
  buildVertexHighlight, buildEdgeHighlight, buildFaceHighlight,
  buildWireframe, triToFaceMap,
} from './editmesh/kernelGeom';

export type { MeshEditOp } from './editmesh/meshEditOps';

/** Operators that exist only in the EditableMesh path (no kernel equivalent) — run via the
 *  bridge. Everything else maps to a native {@link KernelEditSession} operator. */
const BRIDGE_OPS = new Set<MeshEditOp>(['inset', 'subdivide', 'bevel']);

/** Hover tint — magenta, distinct from the yellow selection so the two read apart. */
const HOVER_COLOR = Color3.FromHexString('#ff2e97');

/**
 * Drives Edit Mode for one entity's mesh, backed by the half-edge {@link KernelEditSession}
 * (the topology source of truth). It renders a live preview + component overlays, picks
 * vertices/edges/faces, moves the selection with a gizmo, and runs kernel operators; edits commit
 * back as {@link CustomGeometry} via `onCommit` (one undo step), mirroring SculptController.
 *
 * Three interactions still run on the engine's {@link EditableMesh} (sculpt brushes, the loop-cut
 * and knife sessions) plus the editor-only operators inset/subdivide/bevel. They use a *bridge*:
 * a scratch EditableMesh derived from the session's baked geometry; on commit the session reloads
 * from the result, so the kernel stays authoritative. Dense face/vertex ordering is shared between
 * the two (both come from `toGeometry`), so selection maps across losslessly.
 */
export class MeshEditController {
  private active = false;
  private readonly session = new KernelEditSession();
  /** Scratch EditableMesh for bridged interactions (sculpt/loopcut/knife/inset/subdivide/bevel). */
  private edit?: EditableMesh;
  private entityId?: string;
  private component: ComponentMode = 'face';
  /** Maps a preview triangle index → dense polygon index, for face picking. */
  private triToFace: number[] = [];
  private preview?: Mesh;
  private root?: TransformNode;
  private readonly gizmo: MeshComponentGizmo;
  private previewMat?: StandardMaterial;
  private vertMat?: StandardMaterial;
  private vertBaseMat?: StandardMaterial;
  private faceMat?: StandardMaterial;
  private vertHi?: Mesh;
  private vertAll?: Mesh;
  private faceHi?: Mesh;
  private edgeHi?: import('@babylonjs/core/Meshes/linesMesh').LinesMesh;
  private wire?: import('@babylonjs/core/Meshes/linesMesh').LinesMesh;
  /** Magenta component-under-cursor highlight (one at a time). */
  private hover?: Mesh | import('@babylonjs/core/Meshes/linesMesh').LinesMesh;
  private hoverVertMat?: StandardMaterial;
  private hoverFaceMat?: StandardMaterial;
  private onSelectionChange?: (mode: ComponentMode, keys: string[]) => void;
  private brush: SculptBrushParams | null = null;
  private readonly sculpt: MeshSculptSession;
  private readonly loopCutSession: MeshLoopCutSession;
  private readonly knifeSession: MeshKnifeSession;
  private tool: MeshEditTool = 'select';
  private marquee: MeshMarquee;
  private marqueeArmed = false;
  private marqueeAdditive = false;
  private marqueeStart = { x: 0, y: 0 };
  private showSurfaces = true;
  private onCommit?: (entityId: string, geo: CustomGeometry) => void;

  constructor(
    private readonly scene: Scene,
    private readonly camera: ArcRotateCamera,
    private readonly canvas: HTMLCanvasElement,
    private readonly getMesh: (entityId: string) => AbstractMesh | undefined,
  ) {
    this.marquee = new MeshMarquee(canvas);
    // The sculpt brush + interactive tools operate on the bridged scratch mesh; `getEdit`
    // returns it (lazily derived). They call commit() to fold the result back into the kernel.
    const host: MeshToolHost & { getBrush(): SculptBrushParams | null } = {
      scene,
      camera,
      canvas,
      getEdit: () => this.ensureEdit(),
      getPreview: () => this.preview,
      getRoot: () => this.root,
      getBrush: () => this.brush,
      rebuildPreview: () => this.rebuildPreview(),
      commit: () => this.commitBridge(),
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

  isActive(): boolean {
    return this.active;
  }
  setOnCommit(cb: (entityId: string, geo: CustomGeometry) => void): void {
    this.onCommit = cb;
  }
  setOnSelectionChange(cb: (mode: ComponentMode, keys: string[]) => void): void {
    this.onSelectionChange = cb;
  }

  /** Enter/exit Edit Mode for an entity (mirrors the old controller's contract). */
  setTarget(active: boolean, entityId: string | null, geo?: CustomGeometry | null): void {
    if (active && entityId && this.getMesh(entityId)) this.begin(entityId, geo ?? undefined);
    else this.end();
  }

  setComponentMode(mode: ComponentMode): void {
    if (this.component === mode) return;
    this.component = mode;
    this.session.setComponent(mode as EditComponent);
    this.detachGizmo();
    this.clearHover(); // hover re-picks for the new mode on the next move
    this.refreshOverlay();
    this.emitSelection();
  }

  // ---- lifecycle -----------------------------------------------------------

  private begin(entityId: string, geo?: CustomGeometry): void {
    this.end();
    const src = this.getMesh(entityId);
    if (!src) return;
    this.session.load(geo ?? toCustomGeometry(src));
    this.session.setComponent(this.component as EditComponent);
    this.entityId = entityId;
    this.active = true;

    this.root = new TransformNode('meshedit-root', this.scene);
    this.root.position.copyFrom(src.position);
    this.root.rotationQuaternion = src.rotationQuaternion?.clone() ?? null;
    if (!this.root.rotationQuaternion) this.root.rotation.copyFrom(src.rotation);
    this.root.scaling.copyFrom(src.scaling);
    src.setEnabled(false);

    this.previewMat = new StandardMaterial('meshedit-preview', this.scene);
    this.previewMat.diffuseColor = Color3.FromHexString('#8a93a6');
    this.previewMat.backFaceCulling = false;
    this.vertMat = new StandardMaterial('meshedit-vert', this.scene);
    this.vertMat.emissiveColor = Color3.FromHexString('#ffcc44');
    this.vertMat.disableLighting = true;
    this.vertMat.pointsCloud = true;
    this.vertMat.pointSize = 12;
    this.vertBaseMat = new StandardMaterial('meshedit-vert-base', this.scene);
    this.vertBaseMat.emissiveColor = Color3.FromHexString('#6ea8ff');
    this.vertBaseMat.disableLighting = true;
    this.vertBaseMat.pointsCloud = true;
    this.vertBaseMat.pointSize = 8;
    this.faceMat = new StandardMaterial('meshedit-face', this.scene);
    this.faceMat.emissiveColor = Color3.FromHexString('#ffcc44');
    this.faceMat.disableLighting = true;
    this.faceMat.alpha = 0.35;
    this.faceMat.backFaceCulling = false;
    this.hoverVertMat = new StandardMaterial('meshedit-hoververt', this.scene);
    this.hoverVertMat.emissiveColor = HOVER_COLOR;
    this.hoverVertMat.disableLighting = true;
    this.hoverVertMat.pointsCloud = true;
    this.hoverVertMat.pointSize = 13;
    this.hoverFaceMat = new StandardMaterial('meshedit-hoverface', this.scene);
    this.hoverFaceMat.emissiveColor = HOVER_COLOR;
    this.hoverFaceMat.disableLighting = true;
    this.hoverFaceMat.alpha = 0.35;
    this.hoverFaceMat.backFaceCulling = false;

    this.rebuildPreview();
    this.camera.attachControl(this.canvas, true);
  }

  private end(): void {
    if (this.active && this.entityId) {
      this.commit();
      this.getMesh(this.entityId)?.setEnabled(true);
    }
    this.sculpt.reset();
    this.loopCutSession.reset();
    this.knifeSession.reset();
    this.tool = 'select';
    this.gizmo.dispose();
    this.disposeOverlays();
    this.clearHover();
    this.preview?.dispose();
    this.previewMat?.dispose();
    this.vertMat?.dispose();
    this.vertBaseMat?.dispose();
    this.faceMat?.dispose();
    this.hoverVertMat?.dispose();
    this.hoverFaceMat?.dispose();
    this.root?.dispose();
    this.preview = undefined;
    this.previewMat = undefined;
    this.vertMat = undefined;
    this.vertBaseMat = undefined;
    this.faceMat = undefined;
    this.hoverVertMat = undefined;
    this.hoverFaceMat = undefined;
    this.root = undefined;
    this.edit = undefined;
    this.entityId = undefined;
    this.active = false;
    this.brush = null;
  }

  // ---- preview + overlays --------------------------------------------------

  /** Rebuild the preview mesh from whichever representation is live: the bridged scratch
   *  EditableMesh (during sculpt/loopcut/knife) or the kernel session otherwise. */
  private rebuildPreview(): void {
    if (!this.root) return;
    this.clearHover(); // geometry changed → drop any stale hover; the next move re-picks
    const { positions, normals, indices, triToFace } = this.edit
      ? this.bakeEditPreview(this.edit)
      : this.bakeSessionPreview();
    this.triToFace = triToFace;

    const vertCount = positions.length / 3;
    const existing = this.preview;
    if (existing && !existing.isDisposed() && existing.getTotalVertices() === vertCount && (existing.getIndices()?.length ?? -1) === indices.length) {
      existing.updateVerticesData(VertexBuffer.PositionKind, positions);
      existing.updateVerticesData(VertexBuffer.NormalKind, normals);
      existing.refreshBoundingInfo();
      this.refreshOverlay();
      return;
    }
    this.preview?.dispose();
    const mesh = new Mesh('meshedit-preview', this.scene);
    const vd = new VertexData();
    vd.positions = positions;
    vd.indices = indices;
    vd.normals = normals;
    vd.applyToMesh(mesh, true);
    mesh.material = this.previewMat!;
    mesh.parent = this.root;
    mesh.isPickable = true; // component picking raycasts the preview
    mesh.setEnabled(this.showSurfaces);
    this.preview = mesh;
    this.refreshOverlay();
  }

  /** Flat-shaded render arrays from the kernel session's baked geometry (the common path). */
  private bakeSessionPreview() {
    const geo = this.session.geometry;
    return { positions: geo.positions, normals: geo.normals, indices: geo.indices, triToFace: triToFaceMap(geo) };
  }

  /** Flat-shaded render arrays from the scratch EditableMesh (during a bridged interaction). */
  private bakeEditPreview(edit: EditableMesh) {
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    const triToFace: number[] = [];
    edit.faces.forEach((loop, faceId) => {
      const n = edit.faceNormal(faceId);
      for (let i = 1; i < loop.length - 1; i++) {
        for (const vi of [loop[0], loop[i], loop[i + 1]]) {
          const v = edit.vertices[vi];
          indices.push(positions.length / 3);
          positions.push(v.x, v.y, v.z);
          normals.push(n.x, n.y, n.z);
        }
        triToFace.push(faceId);
      }
    });
    return { positions, normals, indices, triToFace };
  }

  setShowSurfaces(on: boolean): void {
    this.showSurfaces = on;
    this.preview?.setEnabled(on);
  }

  /** Rebuild the component overlays from the kernel selection. The edge wireframe is always drawn
   *  (so the mesh structure reads in every mode); vertex mode also shows all vertices as dots; the
   *  active mode's selection is highlighted on top. Skipped while a bridged tool owns the preview. */
  private refreshOverlay(): void {
    this.disposeOverlays();
    if (!this.root || this.edit) return;
    const geo = this.session.geometry;

    // Always-on wireframe: every polygon edge, so faces/edges are visible in all modes.
    this.wire = buildWireframe(this.scene, geo);
    this.gateOverlay(this.wire);

    if (this.component === 'vertex') {
      const count = geo.polyVerts ? geo.polyVerts.length / 3 : 0;
      this.vertAll = buildVertexHighlight(this.scene, geo, Array.from({ length: count }, (_, i) => i), this.vertBaseMat!);
      this.gateOverlay(this.vertAll);
      this.vertHi = buildVertexHighlight(this.scene, geo, this.session.selectionVerticesCompact(), this.vertMat!);
      this.gateOverlay(this.vertHi);
    } else if (this.component === 'edge') {
      this.edgeHi = buildEdgeHighlight(this.scene, geo, this.session.selectionEdgesCompact());
      this.gateOverlay(this.edgeHi);
    } else {
      this.faceHi = buildFaceHighlight(this.scene, geo, this.session.selectionPolygons(), this.faceMat!);
      this.gateOverlay(this.faceHi);
    }
  }

  /** Parent a selection overlay to the edit root and keep it on the editor-only layer so the
   *  game camera (and any game-preview view) never renders the edit highlights. */
  private gateOverlay(mesh?: { parent: unknown; layerMask: number } | undefined): void {
    if (!mesh || !this.root) return;
    (mesh as unknown as { parent: TransformNode }).parent = this.root;
    mesh.layerMask = EDITOR_LAYER;
  }

  private disposeOverlays(): void {
    this.vertHi?.dispose();
    this.vertAll?.dispose();
    this.faceHi?.dispose();
    this.edgeHi?.dispose();
    this.wire?.dispose();
    this.vertHi = undefined;
    this.vertAll = undefined;
    this.faceHi = undefined;
    this.edgeHi = undefined;
    this.wire = undefined;
  }

  // ---- tools / brushes -----------------------------------------------------

  setSculptBrush(brush: SculptBrushParams | null): void {
    this.brush = brush;
    if (brush) {
      this.setTool('select');
      this.detachGizmo();
      this.clearHover();
      this.ensureEdit(); // derive the scratch mesh sculpt strokes mutate
      this.refreshOverlay();
    } else {
      this.dropEdit();
    }
  }

  setTool(tool: MeshEditTool): void {
    if (this.tool === tool) return;
    this.loopCutSession.reset();
    this.knifeSession.reset();
    this.tool = tool;
    if (tool !== 'select') {
      this.brush = null;
      this.detachGizmo();
      this.clearHover();
      this.session.clearSelection();
      this.ensureEdit(); // loop-cut/knife mutate the scratch mesh
      this.refreshOverlay();
      this.emitSelection();
    } else {
      this.dropEdit();
    }
  }

  // ---- pointer routing -----------------------------------------------------

  routePointer(info: PointerInfo): boolean {
    if (!this.active) return false;
    if (this.brush) return this.sculpt.route(info);
    const e = info.event as PointerEvent;
    if (e.altKey) return true;
    if (this.tool === 'loopcut') return this.loopCutSession.route(info);
    if (this.tool === 'knife') return this.knifeSession.route(info);
    if (this.gizmo.dragging) return true;
    if (e.button === 2) return this.active;

    if (info.type === 1 && e.button === 0) {
      const pick = this.pickComponent();
      if (pick) {
        this.session.applyPick(pick, e.shiftKey ? 'add' : 'replace');
        this.afterSelectionChange();
        this.marqueeArmed = false;
      } else {
        this.marqueeArmed = true;
        this.marqueeAdditive = e.shiftKey;
        this.marqueeStart = { x: e.clientX, y: e.clientY };
      }
    } else if (info.type === 4) {
      if (this.marqueeArmed && !this.gizmo.dragging) {
        if (!this.marquee.isActive() && Math.hypot(e.clientX - this.marqueeStart.x, e.clientY - this.marqueeStart.y) > 6) {
          this.marquee.begin(this.marqueeStart.x, this.marqueeStart.y);
        }
        if (this.marquee.isActive()) this.marquee.update(e.clientX, e.clientY);
      } else if (!this.gizmo.dragging) {
        this.updateHover(); // magenta highlight of the component the cursor is over
      }
    } else if (info.type === 2) {
      if (this.marquee.isActive()) {
        this.boxSelect(this.marqueeAdditive);
        this.marquee.end();
      } else if (this.marqueeArmed && !this.marqueeAdditive) {
        this.session.clearSelection();
        this.afterSelectionChange();
      }
      this.marqueeArmed = false;
    }
    return true;
  }

  // ---- hover (component under the cursor) ----------------------------------

  /** Re-pick under the cursor and show the magenta hover highlight (or clear it on a miss). */
  private updateHover(): void {
    const pick = this.pickComponent();
    if (pick) this.setHover(pick);
    else this.clearHover();
  }

  private setHover(pick: EditPick): void {
    this.clearHover();
    if (!this.root) return;
    const geo = this.session.geometry;
    this.hover =
      pick.kind === 'vertex' ? buildVertexHighlight(this.scene, geo, [pick.vertex], this.hoverVertMat!)
      : pick.kind === 'edge' ? buildEdgeHighlight(this.scene, geo, [pick.edge], HOVER_COLOR)
      : buildFaceHighlight(this.scene, geo, [pick.face], this.hoverFaceMat!);
    this.gateOverlay(this.hover);
  }

  private clearHover(): void {
    this.hover?.dispose();
    this.hover = undefined;
  }

  // ---- picking -------------------------------------------------------------

  /** Resolve the component under the cursor for the active mode → a dense {@link EditPick}.
   *  Uses the engine's raycast (multi-view-correct) to hit the preview face, then for vertex/edge
   *  picks the nearest corner/edge of that face in 3D — no manual screen projection, which would
   *  mismatch the pointer in the editor's multi-view setup. */
  private pickComponent(): EditPick | null {
    const hit = this.pickFace();
    if (!hit) return null;
    if (this.component === 'face') return { kind: 'face', face: hit.faceId };
    const pv = this.session.geometry.polyVerts;
    const loop = this.session.geometry.polygons?.[hit.faceId];
    if (!pv || !loop) return null;
    const p = hit.local;
    if (this.component === 'vertex') {
      let best = -1;
      let bestD = Infinity;
      for (const vi of loop) {
        const d = (pv[vi * 3] - p.x) ** 2 + (pv[vi * 3 + 1] - p.y) ** 2 + (pv[vi * 3 + 2] - p.z) ** 2;
        if (d < bestD) { bestD = d; best = vi; }
      }
      return best < 0 ? null : { kind: 'vertex', vertex: best };
    }
    // edge: the polygon edge (consecutive loop corners) nearest the hit point
    let bestEdge: [number, number] | null = null;
    let bestD = Infinity;
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i];
      const b = loop[(i + 1) % loop.length];
      const d = distToSegment3(pv, a, b, p);
      if (d < bestD) { bestD = d; bestEdge = [a, b]; }
    }
    return bestEdge ? { kind: 'edge', edge: bestEdge } : null;
  }

  /** Raycast the preview surface → dense face id + local-space point (for the bridged tools). */
  private pickFace(): FacePick | null {
    if (!this.preview) return null;
    const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (m) => m === this.preview, false, this.camera);
    if (!pick?.hit || pick.faceId < 0 || !pick.pickedPoint) return null;
    const faceId = this.triToFace[pick.faceId];
    if (faceId === undefined) return null;
    return { faceId, local: this.toLocal(pick.pickedPoint) };
  }

  private boxSelect(additive: boolean): void {
    const rect = this.marquee.rect();
    const edit = this.ensureEdit();
    if (!edit || !this.root || !rect) return;
    if (!additive) this.session.clearSelection();
    const keys = componentsInRect(edit, this.component, rect, this.root.getWorldMatrix(), this.scene, this.camera, this.canvas);
    for (const k of keys) {
      const pick = this.keyToPick(k);
      if (pick) this.session.applyPick(pick, 'add');
    }
    this.dropEdit();
    this.afterSelectionChange();
  }

  /** Parse an EditableMesh component key ("5" / "2|7") into a dense {@link EditPick}. */
  private keyToPick(key: string): EditPick | null {
    if (this.component === 'edge') {
      const [a, b] = key.split('|').map(Number);
      return { kind: 'edge', edge: [a, b] };
    }
    const n = Number(key);
    return this.component === 'vertex' ? { kind: 'vertex', vertex: n } : { kind: 'face', face: n };
  }

  // ---- selection operators -------------------------------------------------

  selectAllComponents(): void {
    // Select every component of the mesh: convert from face (all faces) to the active mode.
    this.session.setComponent('face');
    const geo = this.session.geometry;
    this.session.applyPick({ kind: 'face', face: 0 }, 'replace');
    for (let f = 1; f < (geo.polygons?.length ?? 0); f++) this.session.applyPick({ kind: 'face', face: f }, 'add');
    if (this.component !== 'face') this.session.convertTo(this.component as EditComponent);
    else this.session.setComponent('face');
    this.afterSelectionChange();
  }
  growSelection(): void { this.session.grow(); this.afterSelectionChange(); }
  shrinkSelection(): void { this.session.shrink(); this.afterSelectionChange(); }
  selectEdgeLoop(): void {
    if (this.component !== 'edge') return;
    const edges = this.session.selectionEdgesCompact();
    if (edges[0]) this.session.applyPick({ kind: 'edge', edge: edges[0] }, 'replace', true);
    this.afterSelectionChange();
  }
  selectEdgeRing(): void {
    // Ring selection isn't yet wired to the kernel session; fall back to loop for now.
    this.selectEdgeLoop();
  }

  frameSelection(): void {
    const c = this.session.selectionCentroid();
    if (!c || !this.root) return;
    const world = Vector3.TransformCoordinates(new Vector3(c[0], c[1], c[2]), this.root.getWorldMatrix());
    this.camera.setTarget(world);
  }

  private afterSelectionChange(): void {
    this.refreshOverlay();
    this.attachGizmoToSelection();
    this.emitSelection();
  }

  private toLocal(world: Vector3): Vector3 {
    if (!this.root) return world;
    const inv = this.root.getWorldMatrix().clone().invert();
    return Vector3.TransformCoordinates(world, inv);
  }

  // ---- gizmo-driven component translation ----------------------------------

  private onGizmoDrag(d: { x: number; y: number; z: number }): void {
    this.session.translateSelection(d.x, d.y, d.z);
    this.session.endTransform(); // re-bake; positions already mutated
    this.rebuildPreview();
  }

  private attachGizmoToSelection(): void {
    const c = this.session.selectionCentroid();
    if (!c || !this.root) {
      this.detachGizmo();
      return;
    }
    this.session.beginTransform(); // snapshot so the whole drag is one undo step
    this.gizmo.attach({ x: c[0], y: c[1], z: c[2] }, this.root);
  }
  private detachGizmo(): void {
    this.gizmo.detach();
  }

  // ---- modeling operators --------------------------------------------------

  /** Run a modeling operator against the current selection, then commit. Native kernel ops go
   *  to the session; editor-only ops (inset/subdivide/bevel) run on the bridged scratch mesh. */
  applyOp(op: MeshEditOp, amount = 0): void {
    if (!this.active) return;
    if (BRIDGE_OPS.has(op)) this.runBridgeOp(op, amount);
    else this.runKernelOp(op, amount);
    this.rebuildPreview();
    this.attachGizmoToSelection();
    this.emitSelection();
    this.commit();
  }

  private runKernelOp(op: MeshEditOp, amount: number): void {
    const s = this.session;
    switch (op) {
      case 'extrude': s.extrude(amount || 0.5); break;
      case 'delete': s.deleteSelection(); break;
      case 'merge': s.mergeVertices(); break;
      case 'triangulate': s.triangulate(); break;
      case 'connect': s.connect(); break;
      case 'bridge': s.bridge(); break;
      case 'loopcut': /* interactive tool path; no-op as a one-shot op */ break;
      default: break;
    }
  }

  /** Run an editor-only operator on a scratch EditableMesh, then fold the result into the kernel. */
  private runBridgeOp(op: MeshEditOp, amount: number): void {
    const edit = this.ensureEdit();
    if (!edit) return;
    runMeshOp(edit, op, this.component, this.selectionAsEditKeys(), amount);
    this.session.load(edit.toGeometry());
    this.session.setComponent(this.component as EditComponent);
    this.dropEdit();
  }

  /** Current kernel selection expressed as EditableMesh string keys (dense ordering is shared). */
  private selectionAsEditKeys(): Set<string> {
    if (this.component === 'vertex') return new Set(this.session.selectionVerticesCompact().map(String));
    if (this.component === 'edge') return new Set(this.session.selectionEdgesCompact().map(([a, b]) => (a < b ? `${a}|${b}` : `${b}|${a}`)));
    return new Set(this.session.selectionPolygons().map(String));
  }

  // ---- bridge scratch mesh + commit ----------------------------------------

  /** Lazily derive the scratch EditableMesh from the session's current geometry. */
  private ensureEdit(): EditableMesh | undefined {
    if (!this.active) return undefined;
    if (!this.edit) this.edit = EditableMesh.fromGeometry(this.session.bakeGeometry());
    return this.edit;
  }
  /** Drop the scratch mesh so the preview/overlays follow the kernel again. */
  private dropEdit(): void {
    this.edit = undefined;
    if (this.active) this.rebuildPreview();
  }

  /** Bridged tools/brushes commit through here: fold the scratch mesh into the kernel, then persist. */
  private commitBridge(): void {
    if (this.edit) {
      this.session.load(this.edit.toGeometry());
      this.session.setComponent(this.component as EditComponent);
      // Keep the scratch mesh for continued strokes; re-derive it from the reloaded session so
      // both stay in lockstep (a no-topology-change stroke leaves this cheap).
      this.edit = EditableMesh.fromGeometry(this.session.bakeGeometry());
    }
    this.commit();
  }

  /** Spawn a fresh editable primitive in place of the current mesh (kept for API parity). */
  loadGeometry(geo: CustomGeometry): void {
    this.session.load(geo);
    this.session.setComponent(this.component as EditComponent);
    this.dropEdit();
    this.detachGizmo();
    this.rebuildPreview();
    this.emitSelection();
  }

  /** Write the current kernel geometry back to the store (undoable as one edit). */
  commit(): void {
    if (this.active && this.entityId) this.onCommit?.(this.entityId, this.session.bakeGeometry());
  }

  private emitSelection(): void {
    this.onSelectionChange?.(this.component, this.session.selection.map(String));
  }
}

/** Squared distance from point `p` to the segment between dense verts `a`,`b` in `pv` (3D). */
function distToSegment3(pv: number[], a: number, b: number, p: { x: number; y: number; z: number }): number {
  const ax = pv[a * 3], ay = pv[a * 3 + 1], az = pv[a * 3 + 2];
  const bx = pv[b * 3], by = pv[b * 3 + 1], bz = pv[b * 3 + 2];
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const denom = abx * abx + aby * aby + abz * abz || 1;
  let t = ((p.x - ax) * abx + (p.y - ay) * aby + (p.z - az) * abz) / denom;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + abx * t, cy = ay + aby * t, cz = az + abz * t;
  return (p.x - cx) ** 2 + (p.y - cy) ** 2 + (p.z - cz) ** 2;
}
