import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { MaterialConfig } from '@/types';
import type { StudioEnv } from './modelerEnvironment';
import { StudioPreview } from './modelerScenePreview';
import { PositionGizmo } from '@babylonjs/core/Gizmos/positionGizmo';
import { RotationGizmo } from '@babylonjs/core/Gizmos/rotationGizmo';
import { ScaleGizmo } from '@babylonjs/core/Gizmos/scaleGizmo';
import { UtilityLayerRenderer } from '@babylonjs/core/Rendering/utilityLayerRenderer';
import type { LinesMesh } from '@babylonjs/core/Meshes/linesMesh';
import type { CustomGeometry } from '@/types';
import {
  computeNormals,
  computeBoxUVs,
  buildFaceHighlight,
  buildVertexHighlight,
  buildEdgeHighlight,
  buildWireframe,
  buildGroundGrid,
  buildIslandColors,
} from './modelerSceneGeom';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { ModelerPicker } from './modelerPicker';
import { wireTransformGizmos } from './modelerGizmoWiring';
import { HoverHighlight } from './modelerHover';
import { ModelerEditTools, type EditTool, type LoopCutHandlers, type KnifeHandlers, type DrawPolyHandlers } from './ModelerEditTools';
import { ToolGizmo } from './ToolGizmo';
import { SketchTopoSession, type SketchTopoHandlers } from '@/babylon/editmesh/retopo/SketchTopoSession';

export type { EditTool, LoopCutHandlers, KnifeHandlers, DrawPolyHandlers } from './ModelerEditTools';

/** A picked face report: the polygon index in the current geometry, or null on a miss. */
export type FacePick = number | null;

/** Which component the viewport picks/highlights (object / vertex / edge / face). */
export type ComponentMode = 'object' | 'vertex' | 'edge' | 'face';

/**
 * The result of a viewport pick, in the geometry's compacted index space:
 * the whole object, a polygon (face), a vertex, or an edge (two vertex indices). Null on a
 * miss. The store maps these compacted indices back to kernel ids.
 */
export type ModelerPick =
  | { kind: 'object'; face: number }
  | { kind: 'face'; face: number }
  | { kind: 'vertex'; vertex: number }
  | { kind: 'edge'; edge: [number, number] }
  | null;

/** Which transform gizmo is shown (or none). */
export type GizmoMode = 'select' | 'move' | 'rotate' | 'scale';

/** Callbacks fired across a gizmo drag (begin → repeated delta → end). */
export interface TransformHandlers {
  begin: () => void;
  translate: (dx: number, dy: number, dz: number) => void;
  rotate: (q: { x: number; y: number; z: number; w: number }, pivot: [number, number, number]) => void;
  scale: (sx: number, sy: number, sz: number, pivot: [number, number, number]) => void;
  end: () => void;
}

/**
 * The 3D Modeling Studio's own viewport — a self-contained Babylon scene dedicated to
 * displaying and editing a single kernel mesh. It is deliberately NOT the game
 * SceneManager: no entities, gizmos, game camera, scripts, or play loop. The half-edge
 * kernel owns the model; this class only renders the baked geometry and reports picks.
 *
 * Navigation is standard ArcRotate: left-drag orbits, middle-drag pans, wheel zooms.
 */
export class ModelerScene {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly camera: ArcRotateCamera;
  private mesh?: Mesh;
  private wire?: LinesMesh;
  private faceHi?: Mesh;
  private vertHi?: Mesh;
  private edgeHi?: LinesMesh;
  /** Component-under-cursor hover highlight (vertex / edge / face). */
  private readonly hover: HoverHighlight;
  /** Last left-button press (event time + screen pos), for manual double-click detection. */
  private lastDown = { t: -Infinity, x: 0, y: 0 };
  /** Focused object's dense polygon indices (dim/lock others), or null when nothing is focused. */
  private activePolys: Set<number> | null = null;
  /** Compacted vertex indices of the focused object (for hover gating). */
  private activeVerts: Set<number> | null = null;
  /** The geometry currently displayed (kept so the wireframe can rebuild on toggle). */
  private currentGeo?: CustomGeometry;
  private readonly mat: StandardMaterial;
  private readonly hiMat: StandardMaterial;
  private readonly vertMat: StandardMaterial;
  /** Studio-only viewport preview: environment/IBL, skybox, tone mapping, key/fill lights, and
   *  the lit PBR material. Owns its own lights (see {@link StudioPreview}). */
  private readonly preview: StudioPreview;
  /** Maps a render-triangle index → originating polygon index, for face picking. */
  private triToFace: number[] = [];
  private componentMode: ComponentMode = 'object';
  private onPick?: (pick: ModelerPick, additive: boolean, subtract: boolean, loop: boolean) => void;
  // Transform gizmos (move/rotate/scale the selected faces) on a utility layer.
  private readonly posGizmo: PositionGizmo;
  private readonly rotGizmo: RotationGizmo;
  private readonly scaleGizmo: ScaleGizmo;
  private readonly gizmoNode: TransformNode;
  private gizmoMode: GizmoMode = 'move';
  private wireframe = true;
  private lastGizmoPos = new Vector3();
  private lastQuat = Quaternion.Identity();
  private lastScale = new Vector3(1, 1, 1);
  private transform?: TransformHandlers;
  /** Interactive edit tools (loop cut / knife) — own pointer input while active. */
  private readonly editTools: ModelerEditTools;
  /** Indicator gizmo shown at the loop during a loop-cut drag (see {@link ToolGizmo}). */
  private readonly toolGizmo: ToolGizmo;
  /** Sketch-retopology session (freehand quad-cage drawing over the reference surface). */
  private readonly sketchSession: SketchTopoSession;
  /** Cursor → pick resolver (polygon / vertex / edge / surface point + projection). */
  private readonly picker: ModelerPicker;

  constructor(canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.07, 0.08, 0.11, 1);
    // Overlays (wireframe + face highlight) live in rendering group 1. Keep its depth
    // buffer (don't auto-clear) so the solid surface in group 0 occludes hidden edges —
    // only camera-facing/visible edges draw, instead of all edges showing through.
    this.scene.setRenderingAutoClearDepthStencil(1, false);

    this.camera = new ArcRotateCamera('modelCam', -Math.PI / 3, Math.PI / 3, 8, new Vector3(0, 0.5, 0), this.scene);
    this.camera.attachControl(canvas, true); // left-drag orbit, wheel zoom
    this.camera._panningMouseButton = 1; // middle-drag pans
    // Reserve the right mouse button for the context menu (ArcRotate orbits with it by
    // default); left-drag already handles orbit.
    const ptr = this.camera.inputs.attached.pointers as unknown as { buttons?: number[] } | undefined;
    if (ptr) ptr.buttons = [0, 1];
    this.camera.wheelPrecision = 30;
    this.camera.lowerRadiusLimit = 0.4;
    this.camera.panningSensibility = 600;
    this.camera.minZ = 0.05;

    this.preview = new StudioPreview(this.scene); // lights + env/tone/lit-material preview

    this.mat = new StandardMaterial('modelMat', this.scene);
    this.mat.diffuseColor = Color3.FromHexString('#9aa3b2');
    this.mat.specularColor = new Color3(0.18, 0.18, 0.2);
    this.mat.backFaceCulling = false;
    // Push the surface slightly back in depth so coincident front edges win the depth
    // test (no z-fighting) while back edges stay occluded.
    this.mat.zOffset = 2;

    this.hiMat = new StandardMaterial('faceHi', this.scene);
    this.hiMat.emissiveColor = Color3.FromHexString('#ffcc44');
    this.hiMat.alpha = 0.4;
    this.hiMat.backFaceCulling = false;
    this.hiMat.disableLighting = true;

    // Vertex markers: drawn as a points cloud (large yellow points) over the surface.
    this.vertMat = new StandardMaterial('vertHi', this.scene);
    this.vertMat.emissiveColor = Color3.FromHexString('#ffcc44');
    this.vertMat.disableLighting = true;
    this.vertMat.pointsCloud = true;
    this.vertMat.pointSize = 11;

    buildGroundGrid(this.scene);

    // Move/rotate/scale gizmos on a utility layer, attached to a node placed at the
    // selection centroid. Each reports incremental deltas; the kernel applies them.
    const layer = new UtilityLayerRenderer(this.scene);
    this.gizmoNode = new TransformNode('gizmoNode', this.scene);
    this.posGizmo = new PositionGizmo(layer);
    this.posGizmo.updateGizmoRotationToMatchAttachedMesh = false; // world-aligned axes
    this.rotGizmo = new RotationGizmo(layer);
    this.scaleGizmo = new ScaleGizmo(layer);
    for (const g of [this.posGizmo, this.rotGizmo, this.scaleGizmo]) g.attachedNode = null;

    wireTransformGizmos({
      pos: this.posGizmo,
      rot: this.rotGizmo,
      scale: this.scaleGizmo,
      node: this.gizmoNode,
      lastPos: this.lastGizmoPos,
      lastQuat: this.lastQuat,
      lastScale: this.lastScale,
      getTransform: () => this.transform,
    });

    this.hover = new HoverHighlight(this.scene);

    // Indicator gizmo for the loop-cut drag, on the same utility layer.
    this.toolGizmo = new ToolGizmo(this.scene, layer, this.camera, canvas);

    this.picker = new ModelerPicker(this.scene, this.camera, this.engine, {
      mesh: () => this.mesh,
      geo: () => this.currentGeo,
      triToFace: () => this.triToFace,
      mode: () => this.componentMode,
    });

    // Sketch-retopology session: draws a quad cage over the current mesh (the reference).
    this.sketchSession = new SketchTopoSession(
      this.scene,
      () => this.currentGeo,
      () => this.picker.pickSurfacePoint(),
      this.camera,
      canvas,
    );

    this.editTools = new ModelerEditTools(
      this.scene,
      () => this.currentGeo,
      this.picker.project,
      {
        mode: () => (this.gizmoMode === 'rotate' ? 'rotate' : 'move'),
        begin: (mode, c) => this.toolGizmo.begin(mode, c),
        move: (c) => this.toolGizmo.move(c),
        end: () => this.toolGizmo.end(),
      },
      this.sketchSession,
    );

    this.scene.onPointerObservable.add((info) => {
      const e = info.event as PointerEvent;
      if (this.editTools.route(info.type, e)) {
        this.hover.clear();
        return; // a tool owns input while active
      }
      if (info.type === 4 /* POINTERMOVE */) {
        this.updateHover(e);
        return;
      }
      if (info.type !== 1 /* POINTERDOWN */) return;
      if (this.activeGizmoHovered()) return; // interacting with a gizmo handle isn't a pick
      if (e.button !== 0 || e.altKey) return; // left button only; alt is reserved for nav
      // Shift adds to the selection; Ctrl/Cmd removes from it; a plain click replaces. A
      // double-click expands to the loop in the active mode (edge/vertex/face) through the
      // edge nearest the cursor. We detect the double-click ourselves (two quick downs at the
      // same spot) rather than via Babylon's POINTERDOUBLETAP, which is heuristic and misses.
      const x = this.scene.pointerX;
      const y = this.scene.pointerY;
      const isDouble = e.timeStamp - this.lastDown.t < 400 && Math.hypot(x - this.lastDown.x, y - this.lastDown.y) < 6;
      this.lastDown = { t: e.timeStamp, x, y };
      this.onPick?.(this.picker.pickComponent(), e.shiftKey, e.ctrlKey || e.metaKey, isDouble);
    });
    // The knife finishes on right-click; suppress the browser context menu over the canvas.
    canvas.addEventListener('contextmenu', (ev) => {
      if (this.editTools.active) ev.preventDefault();
    });

    this.engine.runRenderLoop(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      this.scene.render();
    });
  }

  setOnPick(cb: (pick: ModelerPick, additive: boolean, subtract: boolean, loop: boolean) => void): void {
    this.onPick = cb;
  }

  /** Set which component (object/vertex/edge/face) clicks pick. */
  setComponentMode(mode: ComponentMode): void {
    this.componentMode = mode;
    this.hover.clear(); // hover rebuilds for the new mode on the next move
  }

  /** Set the focused object's polygons: dim the rest (vertex colors) and gate hover/pick to
   *  it. Null clears focus (all objects bright + pickable, e.g. in Object mode). */
  setActivePolygons(polys: number[] | null): void {
    this.activePolys = polys ? new Set(polys) : null;
    this.activeVerts = null;
    if (polys && this.currentGeo?.polygons) {
      const verts = new Set<number>();
      for (const p of polys) for (const v of this.currentGeo.polygons[p] ?? []) verts.add(v);
      this.activeVerts = verts;
    }
    if (this.mesh && this.currentGeo) {
      this.mesh.setVerticesData(VertexBuffer.ColorKind, buildIslandColors(this.currentGeo, this.triToFace, this.activePolys));
      // Colors only multiply the diffuse to dim non-focused islands — they must NOT make the
      // mesh transparent. A 4-component color buffer otherwise flips on vertex alpha, routing
      // everything through the alpha-blend pipeline (the "all objects semi-transparent" bug).
      this.mesh.hasVertexAlpha = false;
    }
  }

  /** Highlight the component under the cursor for the active mode (vertex / edge / face),
   *  unless a tool owns input or a button is held (mid-drag). Hover is gated to the focused
   *  object so dimmed objects don't light up. */
  private updateHover(e: PointerEvent): void {
    if (this.editTools.active || e.buttons !== 0 || !this.currentGeo) {
      this.hover.clear();
      return;
    }
    const geo = this.currentGeo;
    if (this.componentMode === 'vertex') {
      const v = this.picker.pickVertex();
      v !== null && this.vertActive(v) ? this.hover.vertex(geo, v) : this.hover.clear();
    } else if (this.componentMode === 'edge') {
      const edge = this.picker.pickEdge();
      edge && this.vertActive(edge[0]) && this.vertActive(edge[1]) ? this.hover.edge(geo, edge) : this.hover.clear();
    } else {
      const f = this.picker.pickFace(); // face & object modes both hover the face under the cursor
      f !== null && (!this.activePolys || this.activePolys.has(f)) ? this.hover.face(geo, f) : this.hover.clear();
    }
  }

  /** Whether a compacted vertex belongs to the focused object (true when nothing is focused). */
  private vertActive(v: number): boolean {
    return !this.activeVerts || this.activeVerts.has(v);
  }

  setOnTransform(handlers: TransformHandlers): void {
    this.transform = handlers;
  }

  setLoopCutHandlers(h: LoopCutHandlers): void {
    this.editTools.setLoopCutHandlers(h);
  }

  setSketchTopoHandlers(h: SketchTopoHandlers): void {
    this.sketchSession.setHandlers(h);
  }

  setKnifeHandlers(h: KnifeHandlers): void {
    this.editTools.setKnifeHandlers(h);
  }

  setDrawPolyHandlers(h: DrawPolyHandlers): void {
    this.editTools.setDrawPolyHandlers(h);
  }

  /** Activate/clear an interactive edit tool. Detaches gizmos while a tool is active. */
  setEditTool(tool: EditTool): void {
    this.editTools.setEditTool(tool);
    if (tool !== 'none') this.detachAll();
    this.hover.clear();
  }

  /** Finish the active tool's in-progress path (Enter key). Returns true if handled. */
  finishEditTool(): boolean {
    return this.editTools.finish();
  }

  /** Show or hide the wireframe edge overlay on the model. */
  setWireframe(on: boolean): void {
    this.wireframe = on;
    this.wire?.dispose();
    this.wire = undefined;
    if (on && this.currentGeo) this.wire = buildWireframe(this.scene, this.currentGeo);
  }

  /** Tint the model's base (diffuse) colour from the Inspector (vertex colours still dim). */
  setBaseColor(hex: string): void {
    try {
      this.mat.diffuseColor = Color3.FromHexString(hex);
      this.preview.setColor(hex);
    } catch { /* bad hex → keep the previous colour */ }
  }

  /** WebGL canvas this scene renders to (for capturing project-cover thumbnails). */
  get renderingCanvas(): HTMLCanvasElement | null {
    return this.engine.getRenderingCanvas();
  }

  /** Apply the Studio viewport preview (env/lights/tone/lit PBR) + re-assign the material. */
  applyStudioEnv(env: StudioEnv, color: string, material?: MaterialConfig): void {
    this.preview.apply(env, color, material);
    if (this.mesh) this.mesh.material = this.preview.activeMaterial(this.mat);
  }

  /** Switch the active transform gizmo (re-attaches at the current node position). */
  setGizmoMode(mode: GizmoMode): void {
    this.gizmoMode = mode;
    this.reattach();
  }

  /** Place the gizmo node at a world centroid (or detach when null), reset its
   *  rotation/scale, and attach the active gizmo. */
  setGizmo(centroid: [number, number, number] | null): void {
    if (!centroid) {
      this.detachAll();
      return;
    }
    this.gizmoNode.position.set(centroid[0], centroid[1], centroid[2]);
    this.gizmoNode.rotationQuaternion = Quaternion.Identity();
    this.gizmoNode.scaling.set(1, 1, 1);
    this.lastGizmoPos.copyFrom(this.gizmoNode.position);
    this.lastQuat.copyFromFloats(0, 0, 0, 1);
    this.lastScale.set(1, 1, 1);
    this.reattach();
  }

  private detachAll(): void {
    this.posGizmo.attachedNode = null;
    this.rotGizmo.attachedNode = null;
    this.scaleGizmo.attachedNode = null;
  }

  private reattach(): void {
    this.detachAll();
    // While an edit tool is active the toolbar's Move/Rotate selection only sets the loop-cut
    // drag mode — it must not pop the selection gizmo (the tool shows its own indicator).
    if (this.editTools.active) return;
    const active = this.gizmoForMode();
    if (active) active.attachedNode = this.gizmoNode;
  }

  private gizmoForMode(): PositionGizmo | RotationGizmo | ScaleGizmo | null {
    if (this.gizmoMode === 'move') return this.posGizmo;
    if (this.gizmoMode === 'rotate') return this.rotGizmo;
    if (this.gizmoMode === 'scale') return this.scaleGizmo;
    return null; // 'select'
  }

  private activeGizmoHovered(): boolean {
    const g = this.gizmoForMode();
    return !!g?.isHovered;
  }

  /** Replace the displayed mesh from baked kernel geometry, rebuilding the pick map. */
  setGeometry(geo: CustomGeometry): void {
    this.mesh?.dispose();
    this.wire?.dispose();
    this.hover.clear(); // stale hover references the old geometry
    const mesh = new Mesh('model', this.scene);
    const vd = new VertexData();
    vd.positions = geo.positions;
    vd.indices = geo.indices;
    vd.normals = geo.normals.length ? geo.normals : computeNormals(geo);
    // Kernel meshes have no UVs (textures would sample one texel); generate box/tri-planar UVs.
    vd.uvs = geo.uvs?.length ? geo.uvs : computeBoxUVs(geo.positions, vd.normals);
    vd.applyToMesh(mesh, true);
    mesh.material = this.preview.activeMaterial(this.mat);
    this.mesh = mesh;
    this.currentGeo = geo;

    // Wireframe overlay so topology reads clearly while modeling (toggleable).
    if (this.wireframe) this.wire = buildWireframe(this.scene, geo);

    // Build triangle→polygon map matching toGeometry's fan triangulation order.
    this.triToFace = [];
    (geo.polygons ?? []).forEach((loop, faceIdx) => {
      for (let i = 1; i < loop.length - 1; i++) this.triToFace.push(faceIdx);
    });
  }

  /**
   * Refresh the selection highlight for the active component mode. Disposes all three
   * highlight overlays (faces / vertices / edges) and rebuilds only the ones present in the
   * payload, all in the geometry's compacted index space.
   */
  setHighlight(
    geo: CustomGeometry,
    payload: { faces?: number[]; verts?: number[]; edges?: Array<[number, number]> },
  ): void {
    this.faceHi?.dispose();
    this.faceHi = undefined;
    this.vertHi?.dispose();
    this.vertHi = undefined;
    this.edgeHi?.dispose();
    this.edgeHi = undefined;
    if (!geo.polyVerts || !geo.polygons) return;
    if (payload.faces?.length) this.faceHi = buildFaceHighlight(this.scene, geo, payload.faces, this.hiMat);
    if (payload.verts?.length) this.vertHi = buildVertexHighlight(this.scene, geo, payload.verts, this.vertMat);
    if (payload.edges?.length) this.edgeHi = buildEdgeHighlight(this.scene, geo, payload.edges);
  }

  /** Frame the camera on the current mesh bounds. */
  frame(): void {
    if (!this.mesh) return;
    const info = this.mesh.getBoundingInfo().boundingSphere;
    this.camera.setTarget(info.centerWorld.clone());
    this.camera.radius = Math.max(info.radiusWorld * 3, 1.5);
  }

  /** A square (quad) grid of lines in the XZ plane — not a wireframe ground, which
   *  triangulates each cell with a diagonal. */

  /** Toggle grid snapping for the transform gizmos (move 1u / rotate 15° / scale 0.25). */
  setSnapping(on: boolean): void {
    this.posGizmo.snapDistance = on ? 1 : 0;
    this.rotGizmo.snapDistance = on ? Math.PI / 12 : 0;
    this.scaleGizmo.snapDistance = on ? 0.25 : 0;
  }

  resize(): void {
    this.engine.resize();
  }

  dispose(): void {
    this.engine.stopRenderLoop();
    this.preview.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}
