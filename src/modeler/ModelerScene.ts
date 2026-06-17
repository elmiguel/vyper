import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { Vector3, Quaternion, Matrix } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { PositionGizmo } from '@babylonjs/core/Gizmos/positionGizmo';
import { RotationGizmo } from '@babylonjs/core/Gizmos/rotationGizmo';
import { ScaleGizmo } from '@babylonjs/core/Gizmos/scaleGizmo';
import { UtilityLayerRenderer } from '@babylonjs/core/Rendering/utilityLayerRenderer';
import type { LinesMesh } from '@babylonjs/core/Meshes/linesMesh';
import type { CustomGeometry } from '@/types';
import {
  computeNormals,
  nearestVertex,
  nearestEdge,
  buildFaceHighlight,
  buildVertexHighlight,
  buildEdgeHighlight,
  buildWireframe,
  buildGroundGrid,
} from './modelerSceneGeom';
import { wireTransformGizmos } from './modelerGizmoWiring';
import { ModelerEditTools, type EditTool, type LoopCutHandlers, type KnifeHandlers, type DrawPolyHandlers } from './ModelerEditTools';
import { ToolGizmo } from './ToolGizmo';
import { SketchTopoSession, type SketchTopoHandlers } from './retopo/SketchTopoSession';

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
  /** Edge under the cursor in edge mode (hover feedback), distinct from the selection. */
  private hoverEdge?: LinesMesh;
  /** Last left-button press (event time + screen pos), for manual double-click detection. */
  private lastDown = { t: -Infinity, x: 0, y: 0 };
  /** The geometry currently displayed (kept so the wireframe can rebuild on toggle). */
  private currentGeo?: CustomGeometry;
  private readonly mat: StandardMaterial;
  private readonly hiMat: StandardMaterial;
  private readonly vertMat: StandardMaterial;
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

    // Soft fill + a key directional light for readable shading.
    const hemi = new HemisphericLight('hemi', new Vector3(0.3, 1, 0.4), this.scene);
    hemi.intensity = 0.75;
    const key = new DirectionalLight('key', new Vector3(-0.5, -1, -0.4), this.scene);
    key.intensity = 1.1;

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

    // Indicator gizmo for the loop-cut drag, on the same utility layer.
    this.toolGizmo = new ToolGizmo(this.scene, layer, this.camera, canvas);

    // Sketch-retopology session: draws a quad cage over the current mesh (the reference).
    this.sketchSession = new SketchTopoSession(
      this.scene,
      () => this.currentGeo,
      () => this.pickSurfacePoint(),
      this.camera,
      canvas,
    );

    this.editTools = new ModelerEditTools(
      this.scene,
      () => this.currentGeo,
      (x, y, z) => this.project(x, y, z),
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
        this.clearHoverEdge();
        return; // a tool owns input while active
      }
      if (info.type === 4 /* POINTERMOVE */) {
        this.updateHoverEdge(e);
        return;
      }
      if (info.type !== 1 /* POINTERDOWN */) return;
      if (this.activeGizmoHovered()) return; // interacting with a gizmo handle isn't a pick
      if (e.button !== 0 || e.altKey) return; // left button only; alt is reserved for nav
      // Shift adds to the selection; Ctrl/Cmd removes from it; a plain click replaces. A
      // double-click expands to the whole edge loop of the clicked edge (edge mode). Detect
      // the double-click ourselves (two quick downs at the same spot) rather than via
      // Babylon's POINTERDOUBLETAP, which is heuristic and misses often.
      const x = this.scene.pointerX;
      const y = this.scene.pointerY;
      const isDouble = e.timeStamp - this.lastDown.t < 400 && Math.hypot(x - this.lastDown.x, y - this.lastDown.y) < 6;
      this.lastDown = { t: e.timeStamp, x, y };
      this.onPick?.(this.pickComponent(), e.shiftKey, e.ctrlKey || e.metaKey, isDouble);
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
    if (mode !== 'edge') this.clearHoverEdge();
  }

  /** Highlight the edge under the cursor (edge mode only, when no tool owns input). Drawn in
   *  a distinct color from the selection so hover and selected edges read apart. */
  private updateHoverEdge(e: PointerEvent): void {
    if (this.componentMode !== 'edge' || this.editTools.active || e.buttons !== 0) {
      this.clearHoverEdge();
      return;
    }
    const edge = this.pickEdge();
    this.clearHoverEdge();
    if (edge && this.currentGeo) {
      this.hoverEdge = buildEdgeHighlight(this.scene, this.currentGeo, [edge], Color3.FromHexString('#ff2e97'));
    }
  }

  private clearHoverEdge(): void {
    this.hoverEdge?.dispose();
    this.hoverEdge = undefined;
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
    this.clearHoverEdge();
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
    this.clearHoverEdge(); // stale hover references the old geometry
    const mesh = new Mesh('model', this.scene);
    const vd = new VertexData();
    vd.positions = geo.positions;
    vd.indices = geo.indices;
    vd.normals = geo.normals.length ? geo.normals : computeNormals(geo);
    vd.applyToMesh(mesh, true);
    mesh.material = this.mat;
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

  /** Pick whatever the active component mode targets, or null on a miss. */
  private pickComponent(): ModelerPick {
    if (this.componentMode === 'vertex') {
      const v = this.pickVertex();
      return v === null ? null : { kind: 'vertex', vertex: v };
    }
    if (this.componentMode === 'edge') {
      const e = this.pickEdge();
      return e === null ? null : { kind: 'edge', edge: e };
    }
    if (this.componentMode === 'object') {
      const f = this.pickFace();
      return f === null ? null : { kind: 'object', face: f };
    }
    const f = this.pickFace();
    return f === null ? null : { kind: 'face', face: f };
  }

  /** Pick the polygon under the cursor (via the triangle→face map), or null. */
  private pickFace(): FacePick {
    if (!this.mesh) return null;
    const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (m) => m === this.mesh);
    if (!pick?.hit || pick.faceId < 0) return null;
    const f = this.triToFace[pick.faceId];
    return f === undefined ? null : f;
  }

  /** The 3D surface point under the cursor on the model mesh, or null on a miss. Used by the
   *  sketch-retopo session to project freehand strokes onto the reference surface. */
  private pickSurfacePoint(): [number, number, number] | null {
    if (!this.mesh) return null;
    const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (m) => m === this.mesh);
    const p = pick?.pickedPoint;
    return pick?.hit && p ? [p.x, p.y, p.z] : null;
  }

  /** Project a world point to screen pixels (matching `scene.pointerX/Y`). */
  private project(x: number, y: number, z: number): { x: number; y: number } {
    const vp = this.camera.viewport.toGlobal(this.engine.getRenderWidth(), this.engine.getRenderHeight());
    const p = Vector3.Project(new Vector3(x, y, z), Matrix.Identity(), this.scene.getTransformMatrix(), vp);
    return { x: p.x, y: p.y };
  }

  /** Nearest compacted vertex to the cursor (within a pixel threshold), or null. */
  private pickVertex(): number | null {
    if (!this.currentGeo) return null;
    return nearestVertex(this.currentGeo, (x, y, z) => this.project(x, y, z), this.scene.pointerX, this.scene.pointerY, 14);
  }

  /** Nearest compacted polygon edge to the cursor (within a pixel threshold), or null. */
  private pickEdge(): [number, number] | null {
    if (!this.currentGeo) return null;
    return nearestEdge(this.currentGeo, (x, y, z) => this.project(x, y, z), this.scene.pointerX, this.scene.pointerY, 12);
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
    this.scene.dispose();
    this.engine.dispose();
  }
}
