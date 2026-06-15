import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { Camera } from '@babylonjs/core/Cameras/camera';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
import { Vector3, Color3, Color4 } from '@babylonjs/core/Maths/math';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import HavokPhysics from '@babylonjs/havok';
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType, PhysicsMotionType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import { PhysicsRaycastResult } from '@babylonjs/core/Physics/physicsRaycastResult';
import type { PhysicsBody } from '@babylonjs/core/Physics/v2/physicsBody';
// Side-effect: augments Scene with enablePhysics/getPhysicsEngine/disablePhysics.
import '@babylonjs/core/Physics/v2/physicsEngineComponent';
import { GizmoManager } from '@babylonjs/core/Gizmos/gizmoManager';
import { HighlightLayer } from '@babylonjs/core/Layers/highlightLayer';
import { UtilityLayerRenderer } from '@babylonjs/core/Rendering/utilityLayerRenderer';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { LinesMesh } from '@babylonjs/core/Meshes/linesMesh';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { Light } from '@babylonjs/core/Lights/light';
import '@babylonjs/core/Helpers/sceneHelpers';
import '@babylonjs/core/Gizmos/positionGizmo';
import '@babylonjs/core/Gizmos/planeDragGizmo'; // two-axis (planar) translate handles
import '@babylonjs/core/Gizmos/rotationGizmo';
import '@babylonjs/core/Gizmos/scaleGizmo';
import '@babylonjs/core/Rendering/edgesRenderer';
// Side-effect required by HighlightLayer in the tree-shaken core build.
import '@babylonjs/core/Layers/effectLayerSceneComponent';
// Side-effect that augments the engine with registerView/unRegisterView (multi-view).
import '@babylonjs/core/Engines/AbstractEngine/abstractEngine.views';
// Side-effect for MeshBuilder.CreateLineSystem (camera frustum helper).
import '@babylonjs/core/Meshes/Builders/linesBuilder';
// Side-effect for MeshBuilder.CreateDisc (2D circle / triangle shapes).
import '@babylonjs/core/Meshes/Builders/discBuilder';

import type { IParticleSystem } from '@babylonjs/core/Particles/IParticleSystem';
import type { Entity, EffectConfig, GameMode, GizmoMode, Vec3 } from '@/types';
import { buildParticleSystem } from './effects';
import { GAME_CAMERA_ID, EDITOR_LAYER, DEFAULT_LAYER } from './editorObjects';

const DEG = Math.PI / 180;
const CAM_HELPER_COLOR = '#22d3ee';
const DOUBLE_SIDED = 2; // Mesh.DOUBLESIDE — flat 2D shapes are visible from either side.

function buildMesh(scene: Scene, e: Entity): AbstractMesh {
  const kind = e.mesh!.kind;
  switch (kind) {
    case 'sphere':
      return MeshBuilder.CreateSphere(e.id, { diameter: 1, segments: 24 }, scene);
    case 'ground':
      return MeshBuilder.CreateGround(e.id, { width: 12, height: 12, subdivisions: 2 }, scene);
    case 'plane':
      return MeshBuilder.CreatePlane(e.id, { size: 2, sideOrientation: DOUBLE_SIDED }, scene);
    case 'cylinder':
      return MeshBuilder.CreateCylinder(e.id, { height: 1.4, diameter: 1 }, scene);
    case 'cone':
      return MeshBuilder.CreateCylinder(e.id, { height: 1.4, diameterTop: 0, diameterBottom: 1 }, scene);
    // ---- 2D shapes: flat, lying in the XY plane ----
    case 'square':
      return MeshBuilder.CreatePlane(e.id, { size: 1, sideOrientation: DOUBLE_SIDED }, scene);
    case 'circle':
      return MeshBuilder.CreateDisc(e.id, { radius: 0.5, tessellation: 48, sideOrientation: DOUBLE_SIDED }, scene);
    case 'triangle':
      return MeshBuilder.CreateDisc(e.id, { radius: 0.6, tessellation: 3, sideOrientation: DOUBLE_SIDED }, scene);
    case 'box':
    default:
      return MeshBuilder.CreateBox(e.id, { size: 1 }, scene);
  }
}

interface Tracked {
  mesh?: AbstractMesh;
  light?: Light;
  meshKind?: string;
  lightKind?: string;
}

export class SceneManager {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly mode: GameMode;
  readonly editorCamera: ArcRotateCamera;
  readonly gameCamera: UniversalCamera;
  /** Half-height (world units) of the 2D orthographic game view. */
  private gameOrthoSize = 6;
  private gizmos: GizmoManager;
  private highlight: HighlightLayer;
  private tracked = new Map<string, Tracked>();
  private snapshot = new Map<string, Entity['transform']>();
  private onPick?: (id: string | null) => void;
  private onTransform?: (id: string, patch: Partial<Entity['transform']>) => void;
  private onCameraTransform?: (patch: { position: Vec3; rotation: Vec3 }) => void;
  private grid?: AbstractMesh;
  private gameCamHelper?: Mesh;
  private selectedId: string | null = null;
  private gizmoMode: GizmoMode = 'move';
  private wiredGizmos = { move: false, rotate: false, scale: false };

  /** Hidden WebGL backbuffer. Babylon copies it into each registered 2D view canvas. */
  private master: HTMLCanvasElement;

  // ----- Physics (Havok) -----
  private havok: HavokPlugin | null = null;
  private havokPromise: Promise<HavokPlugin> | null = null;
  private aggregates = new Map<string, PhysicsAggregate>();
  /** True between enablePhysics() and disablePhysics() (i.e. during Play). */
  physicsActive = false;
  /** The visible game-preview canvas, used as the pointer-lock target. */
  private previewCanvas: HTMLCanvasElement | null = null;
  private rayResult = new PhysicsRaycastResult();

  constructor(canvas: HTMLCanvasElement, mode: GameMode = '3d') {
    this.mode = mode;
    const is2D = mode === '2d';
    // In multi-view mode the engine renders to a master WebGL canvas and copies
    // the result into each registered view (a 2D canvas). So the engine owns a
    // hidden master; the visible editor canvas is registered as a view below.
    this.master = document.createElement('canvas');
    this.master.width = 1280;
    this.master.height = 720;

    this.engine = new Engine(this.master, true, { preserveDrawingBuffer: true, stencil: true });
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.05, 0.06, 0.09, 1);

    if (is2D) {
      // 2D: orthographic editor camera facing the XY plane head-on from -Z (looking
      // toward +Z, up = +Y) so +X is screen-right — the standard 2D orientation.
      // Orbit is locked; pan with middle/ctrl-drag, zoom with the wheel (drives ortho bounds).
      this.editorCamera = new ArcRotateCamera('editorCam', -Math.PI / 2, Math.PI / 2, 16, new Vector3(0, 0, 0), this.scene);
      this.editorCamera.mode = Camera.ORTHOGRAPHIC_CAMERA;
      this.editorCamera.angularSensibilityX = 1e12; // effectively no rotation
      this.editorCamera.angularSensibilityY = 1e12;
    } else {
      this.editorCamera = new ArcRotateCamera('editorCam', -Math.PI / 3, Math.PI / 3, 16, new Vector3(0, 1, 0), this.scene);
    }
    this.editorCamera.wheelPrecision = is2D ? 18 : 30;
    this.editorCamera.lowerRadiusLimit = 2;
    this.editorCamera.attachControl(canvas, true);
    // The editor camera sees everything, including editor-only helpers.
    this.editorCamera.layerMask = DEFAULT_LAYER | EDITOR_LAYER;
    // Reserve the right mouse button for context menus (ArcRotate orbits with it by default).
    const ptr = this.editorCamera.inputs.attached.pointers as unknown as { buttons?: number[] } | undefined;
    if (ptr) ptr.buttons = [0, 1];

    if (is2D) {
      // 2D game camera: orthographic, viewing the XY plane from -Z (same side as the
      // editor camera) so the preview matches the editor and +X is screen-right.
      this.gameCamera = new UniversalCamera('gameCam', new Vector3(0, 0, this.CAM2D_Z), this.scene);
      this.gameCamera.setTarget(new Vector3(0, 0, 0));
      this.gameCamera.mode = Camera.ORTHOGRAPHIC_CAMERA;
    } else {
      this.gameCamera = new UniversalCamera('gameCam', new Vector3(0, 4, -10), this.scene);
      this.gameCamera.setTarget(new Vector3(0, 1, 0));
    }
    // The game camera renders only the game — never editor helpers (grid, camera rig).
    this.gameCamera.layerMask = DEFAULT_LAYER;

    this.scene.activeCamera = this.editorCamera;

    this.highlight = new HighlightLayer('hl', this.scene);

    this.gizmos = new GizmoManager(this.scene);
    this.gizmos.usePointerToAttachGizmos = false;
    this.setGizmoMode('move');

    this.createGrid();
    this.createGameCameraHelper();

    // Editor-only overlays (selection highlight + gizmo utility layers) must not
    // bleed into the game view. Gate them to renders driven by the editor camera.
    this.scene.onBeforeCameraRenderObservable.add((cam) => {
      const editorView = cam === this.editorCamera;
      this.highlight.isEnabled = editorView;
      const util = UtilityLayerRenderer.DefaultUtilityLayer;
      const utilDepth = UtilityLayerRenderer.DefaultKeepDepthUtilityLayer;
      if (util) util.shouldRender = editorView;
      if (utilDepth) utilDepth.shouldRender = editorView;

      // 2D: keep each orthographic camera's frustum matched to its view's aspect.
      // (Done per-camera-render because the editor and game views differ in size.)
      if (this.mode === '2d') {
        const aspect = this.engine.getRenderWidth() / this.engine.getRenderHeight() || 16 / 9;
        const halfH = editorView ? Math.max(this.editorCamera.radius * 0.5, 0.5) : this.gameOrthoSize;
        cam.orthoTop = halfH;
        cam.orthoBottom = -halfH;
        cam.orthoLeft = -halfH * aspect;
        cam.orthoRight = halfH * aspect;
      }
    });

    // Picking → selection. Pick explicitly through the editor camera.
    this.scene.onPointerObservable.add((info) => {
      if (info.type !== 1 /* POINTERDOWN */) return;
      // Ignore the right button — it opens the context menu, not a selection change.
      if ((info.event as PointerEvent).button === 2) return;
      this.onPick?.(this.pickAtPointer());
    });

    // The visible editor canvas is a registered view (editor camera). Babylon's
    // _renderViewStep sets/restores the camera per view, so the render loop is
    // just scene.render(). Input is routed from the editor canvas.
    this.engine.registerView(canvas, this.editorCamera);
    this.engine.inputElement = canvas;
    this.engine.runRenderLoop(() => this.scene.render());
  }

  /** Register a second canvas that renders the same scene through the game camera. */
  registerPreview(canvas: HTMLCanvasElement): () => void {
    this.engine.registerView(canvas, this.gameCamera);
    this.previewCanvas = canvas;
    return () => {
      try {
        this.engine.unRegisterView(canvas);
      } catch {
        /* already gone */
      }
      if (this.previewCanvas === canvas) this.previewCanvas = null;
    };
  }

  // ===================== Physics =====================

  /** Load + cache the Havok WASM plugin once. Safe to call repeatedly. */
  async loadHavok(): Promise<HavokPlugin> {
    if (this.havok) return this.havok;
    if (!this.havokPromise) {
      // The .wasm is served from /public (see vite copy) so the bundler doesn't
      // have to resolve it from inside the (excluded) Havok glue module.
      this.havokPromise = HavokPhysics({ locateFile: () => '/HavokPhysics.wasm' }).then(
        (hk) => new HavokPlugin(true, hk),
      );
    }
    this.havok = await this.havokPromise;
    return this.havok;
  }

  /** Enable physics on the scene and build bodies for entities that opt in. Call on Play. */
  async enablePhysics(entities: Entity[]): Promise<void> {
    if (this.mode === '2d') return; // player controllers / dynamics are 3D-only for now
    const plugin = await this.loadHavok();
    if (!this.scene.getPhysicsEngine()) {
      this.scene.enablePhysics(new Vector3(0, -9.81, 0), plugin);
    }
    this.physicsActive = true;
    for (const e of entities) {
      if (e.physics?.enabled && e.mesh) {
        this.ensureBody(e.id, e.physics);
      } else if (e.mesh && (e.mesh.kind === 'ground' || e.mesh.kind === 'plane')) {
        // Floors get a static collider automatically so character controllers
        // (which create their own dynamic body at runtime) have something to
        // stand on without the user wiring up physics by hand.
        this.ensureBody(e.id, { type: 'static', shape: 'box' });
      }
    }
  }

  /** Dispose all bodies and turn physics off. Call on Stop. */
  disablePhysics(): void {
    for (const agg of this.aggregates.values()) agg.dispose();
    this.aggregates.clear();
    if (this.scene.getPhysicsEngine()) this.scene.disablePhysicsEngine();
    this.physicsActive = false;
  }

  private shapeTypeFor(entityId: string, hint?: string): number {
    const kind = hint && hint !== 'auto' ? hint : this.tracked.get(entityId)?.meshKind;
    switch (kind) {
      case 'sphere':
      case 'circle':
        return PhysicsShapeType.SPHERE;
      case 'capsule':
        return PhysicsShapeType.CAPSULE;
      case 'cylinder':
      case 'cone':
        return PhysicsShapeType.CYLINDER;
      default:
        return PhysicsShapeType.BOX;
    }
  }

  /**
   * Create (or fetch) a physics body for an entity. Used both for Inspector-configured
   * bodies and for runtime `entity.usePhysics(...)` from controller scripts.
   * `type: 'character'` makes an upright, non-tipping dynamic capsule for player controllers.
   */
  ensureBody(
    entityId: string,
    opts: {
      type?: 'dynamic' | 'static' | 'kinematic' | 'character';
      shape?: string;
      mass?: number;
      restitution?: number;
      friction?: number;
    } = {},
  ): PhysicsBody | null {
    const existing = this.aggregates.get(entityId);
    if (existing) return existing.body;
    const mesh = this.tracked.get(entityId)?.mesh;
    if (!mesh || !this.physicsActive) return null;

    const type = opts.type ?? 'dynamic';
    const shapeType =
      type === 'character' ? PhysicsShapeType.CAPSULE : this.shapeTypeFor(entityId, opts.shape);
    const mass = type === 'static' ? 0 : opts.mass ?? 1;
    const agg = new PhysicsAggregate(
      mesh,
      shapeType,
      { mass, restitution: opts.restitution ?? 0.1, friction: opts.friction ?? 0.6 },
      this.scene,
    );
    if (type === 'static') agg.body.setMotionType(PhysicsMotionType.STATIC);
    if (type === 'kinematic') agg.body.setMotionType(PhysicsMotionType.ANIMATED);
    if (type === 'character') {
      // Zero rotational inertia + heavy angular damping keeps the capsule upright.
      agg.body.setMassProperties({ inertia: new Vector3(0, 0, 0) });
      agg.body.setAngularDamping(100);
    }
    this.aggregates.set(entityId, agg);
    return agg.body;
  }

  getBody(entityId: string): PhysicsBody | null {
    return this.aggregates.get(entityId)?.body ?? null;
  }

  /** Cast a ray and return the hit distance (Infinity if nothing hit). */
  physicsRaycastDistance(from: Vector3, to: Vector3): number {
    const engine = this.scene.getPhysicsEngine();
    if (!engine) return Infinity;
    (engine as unknown as { raycastToRef(a: Vector3, b: Vector3, r: PhysicsRaycastResult): void }).raycastToRef(
      from,
      to,
      this.rayResult,
    );
    return this.rayResult.hasHit ? this.rayResult.hitDistance : Infinity;
  }

  requestPointerLock(): void {
    this.previewCanvas?.requestPointerLock?.();
  }

  exitPointerLock(): void {
    if (typeof document !== 'undefined' && document.pointerLockElement) document.exitPointerLock();
  }

  // ===================== Effects (particle VFX) =====================

  /** Live particle systems, keyed by entityId, so they can be stopped/cleared. */
  private effectSystems = new Map<string, IParticleSystem[]>();

  /**
   * Build + start a particle effect emitting from an entity's mesh (or world
   * origin if it has none). Used for auto-play, script `entity.playEffect()`,
   * and fx nodes. One-shot/timed vs looped behaviour comes from the config.
   */
  playEffect(entityId: string, config: EffectConfig): void {
    const mesh = this.tracked.get(entityId)?.mesh;
    const emitter = mesh ?? { x: 0, y: 0, z: 0 };
    const ps = buildParticleSystem(this.scene, config, emitter, `fx_${entityId}`);
    const list = this.effectSystems.get(entityId) ?? [];
    list.push(ps);
    this.effectSystems.set(entityId, list);
    // Drop one-shot systems from tracking once they self-dispose.
    ps.onDisposeObservable.add(() => {
      const arr = this.effectSystems.get(entityId);
      if (!arr) return;
      const i = arr.indexOf(ps);
      if (i >= 0) arr.splice(i, 1);
    });
    ps.start();
  }

  /** Stop (and dispose) all effects on an entity. */
  stopEffect(entityId: string): void {
    const list = this.effectSystems.get(entityId);
    if (!list) return;
    for (const ps of list.slice()) {
      ps.stop();
      ps.dispose();
    }
    this.effectSystems.delete(entityId);
  }

  /** Dispose every running effect (called on Stop / teardown). */
  clearEffects(): void {
    for (const list of this.effectSystems.values()) {
      for (const ps of list.slice()) ps.dispose();
    }
    this.effectSystems.clear();
  }

  private createGrid() {
    const grid = MeshBuilder.CreateGround('__grid', { width: 40, height: 40, subdivisions: 40 }, this.scene);
    const mat = new StandardMaterial('__gridMat', this.scene);
    mat.wireframe = true;
    mat.emissiveColor = new Color3(0.18, 0.12, 0.34);
    mat.disableLighting = true;
    grid.material = mat;
    grid.isPickable = false;
    if (this.mode === '2d') {
      // Stand the grid up into the XY plane (it's built flat in XZ) so it faces the 2D camera.
      grid.rotation.x = -Math.PI / 2;
      grid.position.z = 0.001;
    } else {
      grid.position.y = -0.001;
    }
    grid.layerMask = EDITOR_LAYER; // editor-only — never rendered by the game camera
    this.grid = grid;
  }

  /** A camera helper for the editor view. 3D: a camera-shaped rig. 2D: a view-frame rectangle. */
  private createGameCameraHelper() {
    if (this.mode === '2d') return this.createGameCameraHelper2D();
    const body = MeshBuilder.CreateBox(GAME_CAMERA_ID, { width: 0.7, height: 0.5, depth: 0.9 }, this.scene);
    const lens = MeshBuilder.CreateCylinder(
      `${GAME_CAMERA_ID}:lens`,
      { height: 0.45, diameterTop: 0.6, diameterBottom: 0.28, tessellation: 20 },
      this.scene,
    );
    lens.parent = body;
    lens.rotation.x = Math.PI / 2;
    lens.position.z = 0.62;

    // Wireframe frustum opening toward +z (the camera's forward) for facing feedback.
    const f = 2.2, w = 1.1, h = 0.7;
    const apex = new Vector3(0, 0, 0);
    const c = [new Vector3(-w, h, f), new Vector3(w, h, f), new Vector3(w, -h, f), new Vector3(-w, -h, f)];
    const lines = [
      [apex, c[0]], [apex, c[1]], [apex, c[2]], [apex, c[3]],
      [c[0], c[1]], [c[1], c[2]], [c[2], c[3]], [c[3], c[0]],
    ];
    const frustum = MeshBuilder.CreateLineSystem(`${GAME_CAMERA_ID}:frustum`, { lines }, this.scene) as LinesMesh;
    frustum.color = Color3.FromHexString(CAM_HELPER_COLOR);
    frustum.parent = body;
    frustum.isPickable = false;

    const mat = new StandardMaterial(`${GAME_CAMERA_ID}:mat`, this.scene);
    mat.emissiveColor = Color3.FromHexString(CAM_HELPER_COLOR);
    mat.diffuseColor = Color3.FromHexString('#0a2730');
    mat.specularColor = new Color3(0, 0, 0);
    body.material = mat;
    lens.material = mat;

    for (const m of [body, lens, frustum]) m.layerMask = EDITOR_LAYER;
    body.isPickable = true;
    lens.isPickable = true;
    this.gameCamHelper = body;
  }

  /** 2D camera helper: a rectangle showing the orthographic view bounds in the XY plane. */
  private createGameCameraHelper2D() {
    const halfH = this.gameOrthoSize;
    const halfW = halfH * (16 / 9);
    // A faint, pickable fill so the camera is selectable by clicking inside its frame.
    const body = MeshBuilder.CreatePlane(GAME_CAMERA_ID, { width: halfW * 2, height: halfH * 2, sideOrientation: DOUBLE_SIDED }, this.scene);
    const fill = new StandardMaterial(`${GAME_CAMERA_ID}:mat`, this.scene);
    fill.emissiveColor = Color3.FromHexString(CAM_HELPER_COLOR);
    fill.disableLighting = true;
    fill.alpha = 0.06;
    body.material = fill;

    // Bright border outline.
    const c = [new Vector3(-halfW, halfH, 0), new Vector3(halfW, halfH, 0), new Vector3(halfW, -halfH, 0), new Vector3(-halfW, -halfH, 0)];
    const frame = MeshBuilder.CreateLineSystem(
      `${GAME_CAMERA_ID}:frame`,
      { lines: [[c[0], c[1]], [c[1], c[2]], [c[2], c[3]], [c[3], c[0]]] },
      this.scene,
    ) as LinesMesh;
    frame.color = Color3.FromHexString(CAM_HELPER_COLOR);
    frame.parent = body;
    frame.isPickable = false;

    for (const m of [body, frame]) m.layerMask = EDITOR_LAYER;
    body.isPickable = true;
    this.gameCamHelper = body;
  }

  private isCameraHelperMesh(m: AbstractMesh): boolean {
    return m.name === GAME_CAMERA_ID || m.name.startsWith(`${GAME_CAMERA_ID}:`);
  }

  /** A mesh is selectable if it's a tracked entity mesh or the camera helper. */
  private isPickable(m: AbstractMesh): boolean {
    if (this.isCameraHelperMesh(m)) return true;
    return this.tracked.has(m.name) && this.tracked.get(m.name)!.mesh === m;
  }

  private idForMesh(m: AbstractMesh): string {
    return this.isCameraHelperMesh(m) ? GAME_CAMERA_ID : m.name;
  }

  private meshForSelection(id: string | null): AbstractMesh | undefined {
    if (!id) return undefined;
    if (id === GAME_CAMERA_ID) return this.gameCamHelper;
    return this.tracked.get(id)?.mesh;
  }

  /** Pick whatever the cursor is currently over (used by selection + context menu). */
  pickAtPointer(): string | null {
    const pick = this.scene.pick(
      this.scene.pointerX,
      this.scene.pointerY,
      (m) => this.isPickable(m),
      false,
      this.editorCamera,
    );
    return pick?.hit && pick.pickedMesh ? this.idForMesh(pick.pickedMesh) : null;
  }

  setGridVisible(visible: boolean) {
    this.grid?.setEnabled(visible);
  }

  /** Fixed -Z distance of the 2D orthographic game camera from the play plane. */
  private readonly CAM2D_Z = -10;

  /** Apply the store's game-camera transform to both the real camera and its helper. */
  applyGameCamera(t: { position: Vec3; rotation: Vec3 }) {
    const { position: p, rotation: r } = t;
    if (this.mode === '2d') {
      // 2D pans in XY only; the camera stays at a fixed -Z depth looking toward +Z.
      this.gameCamera.position.set(p.x, p.y, this.CAM2D_Z);
      this.gameCamera.setTarget(new Vector3(p.x, p.y, 0));
      const helper = this.gameCamHelper;
      if (helper) {
        helper.rotationQuaternion = null;
        helper.position.set(p.x, p.y, 0);
        helper.rotation.set(0, 0, 0);
      }
      return;
    }
    this.gameCamera.position.set(p.x, p.y, p.z);
    this.gameCamera.rotation.set(r.x * DEG, r.y * DEG, r.z * DEG);
    const helper = this.gameCamHelper;
    if (helper) {
      helper.rotationQuaternion = null;
      helper.position.set(p.x, p.y, p.z);
      helper.rotation.set(r.x * DEG, r.y * DEG, r.z * DEG);
    }
  }

  setOnPick(cb: (id: string | null) => void) {
    this.onPick = cb;
  }

  /** Hook to write gizmo-driven transform changes back to the store. */
  setOnTransform(cb: (id: string, patch: Partial<Entity['transform']>) => void) {
    this.onTransform = cb;
  }

  /** Hook to write game-camera moves (via its editor helper) back to the store. */
  setOnCameraTransform(cb: (patch: { position: Vec3; rotation: Vec3 }) => void) {
    this.onCameraTransform = cb;
  }

  private readonly RAD = 180 / Math.PI;

  /** Read the attached mesh's full transform and report it to the store. */
  private reportTransform = () => {
    const mesh = this.gizmos.attachedMesh;
    if (!mesh) return;
    // The rotation gizmo writes rotationQuaternion; convert it back to euler.
    const euler = mesh.rotationQuaternion ? mesh.rotationQuaternion.toEulerAngles() : mesh.rotation;
    const rotation = { x: euler.x * this.RAD, y: euler.y * this.RAD, z: euler.z * this.RAD };
    const position = { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z };
    // The camera helper drives the game camera, not an entity.
    if (this.isCameraHelperMesh(mesh)) {
      // 2D: the frame only pans in XY; keep depth/orientation fixed (looking toward +Z).
      if (this.mode === '2d') {
        this.onCameraTransform?.({ position: { x: position.x, y: position.y, z: this.CAM2D_Z }, rotation: { x: 0, y: 0, z: 0 } });
      } else {
        this.onCameraTransform?.({ position, rotation });
      }
      return;
    }
    this.onTransform?.(mesh.name, {
      position,
      rotation,
      scale: { x: mesh.scaling.x, y: mesh.scaling.y, z: mesh.scaling.z },
    });
  };

  /** Switch the active transform gizmo (move / rotate / scale / select). */
  setGizmoMode(mode: GizmoMode) {
    this.gizmoMode = mode;
    this.gizmos.positionGizmoEnabled = mode === 'move';
    this.gizmos.rotationGizmoEnabled = mode === 'rotate';
    this.gizmos.scaleGizmoEnabled = mode === 'scale';

    // Configure + wire each gizmo once (they are created lazily on first enable).
    // onDragEndObservable on each parent gizmo aggregates ALL of its sub-handles
    // (axes, plane handles, uniform box), so one handler covers every drag.
    const g = this.gizmos.gizmos;
    const is2D = this.mode === '2d';
    if (g.positionGizmo && !this.wiredGizmos.move) {
      this.wiredGizmos.move = true;
      const pg = g.positionGizmo;
      // 2D moves in XY only; 3D gets two-axis plane handles (XY / YZ / XZ).
      pg.planarGizmoEnabled = !is2D;
      if (is2D) pg.zGizmo.isEnabled = false;
      pg.scaleRatio = 1.1;
      pg.updateGizmoRotationToMatchAttachedMesh = false; // world-aligned axes
      pg.onDragEndObservable.add(this.reportTransform);
    }
    if (g.rotationGizmo && !this.wiredGizmos.rotate) {
      this.wiredGizmos.rotate = true;
      const rg = g.rotationGizmo;
      // 2D rotates only around Z (the axis facing the camera).
      if (is2D) {
        rg.xGizmo.isEnabled = false;
        rg.yGizmo.isEnabled = false;
      }
      rg.scaleRatio = 1.05;
      rg.updateGizmoRotationToMatchAttachedMesh = true; // rings follow the object's orientation
      rg.onDragEndObservable.add(this.reportTransform);
    }
    if (g.scaleGizmo && !this.wiredGizmos.scale) {
      this.wiredGizmos.scale = true;
      const sg = g.scaleGizmo;
      if (is2D) sg.zGizmo.isEnabled = false; // no depth in 2D
      sg.scaleRatio = 1.1;
      sg.sensitivity = 1;
      sg.onDragEndObservable.add(this.reportTransform);
    }

    this.reattachGizmo();
  }

  private reattachGizmo() {
    const mesh = this.meshForSelection(this.selectedId);
    this.gizmos.attachToMesh((mesh as Mesh) ?? null);
  }

  /** Frame the editor camera on an entity/editor object (or reset if none). */
  focusOn(id: string | null) {
    const mesh = this.meshForSelection(id);
    const target = mesh ? mesh.getBoundingInfo().boundingSphere.centerWorld : new Vector3(0, 1, 0);
    this.editorCamera.setTarget(target.clone());
    if (mesh) {
      const r = mesh.getBoundingInfo().boundingSphere.radiusWorld || 1;
      this.editorCamera.radius = Math.max(r * 3.2, 3);
    }
  }

  resize() {
    // Registered views auto-resize to their canvas client size each frame
    // (see _renderViewStep), so no explicit engine.resize() is needed — and
    // calling it would size the detached master canvas to 0×0.
  }

  getMesh(id: string): AbstractMesh | undefined {
    return this.tracked.get(id)?.mesh;
  }

  // ----- Runtime entity control (used by cross-entity script/trigger actions) -----

  /** Show/hide an entity's mesh at runtime (restored by sync on Stop). */
  setEntityVisible(id: string, visible: boolean): void {
    this.tracked.get(id)?.mesh?.setEnabled(visible);
  }

  /** Activate/deactivate: hide the mesh and remove its physics body. */
  setEntityActive(id: string, active: boolean): void {
    const t = this.tracked.get(id);
    t?.mesh?.setEnabled(active);
    if (!active) {
      const agg = this.aggregates.get(id);
      if (agg) {
        agg.dispose();
        this.aggregates.delete(id);
      }
    }
  }

  /** Destroy an entity's runtime presence (mesh, body, effects). Rebuilt by sync on Stop. */
  destroyRuntimeEntity(id: string): void {
    this.stopEffect(id);
    const agg = this.aggregates.get(id);
    if (agg) {
      agg.dispose();
      this.aggregates.delete(id);
    }
    const t = this.tracked.get(id);
    t?.mesh?.dispose();
    t?.light?.dispose();
    // Drop the tracked entry so a later sync() rebuilds it from the store.
    this.tracked.delete(id);
  }

  highlightSelection(id: string | null) {
    this.selectedId = id;
    this.highlight.removeAllMeshes();
    this.gizmos.attachToMesh(null);
    if (!id) return;
    const mesh = this.meshForSelection(id);
    if (mesh && 'addMesh' in this.highlight) {
      const color = id === GAME_CAMERA_ID ? CAM_HELPER_COLOR : '#ffcc44';
      this.highlight.addMesh(mesh as never, Color3.FromHexString(color));
      if (this.gizmoMode !== 'select') this.gizmos.attachToMesh(mesh as never);
    }
  }

  /** Reconcile Babylon objects with the store's entity list. */
  sync(entities: Entity[], opts: { skipTransforms?: boolean } = {}) {
    const present = new Set(entities.map((e) => e.id));
    // Remove stale.
    for (const [id, t] of this.tracked) {
      if (!present.has(id)) {
        t.mesh?.dispose();
        t.light?.dispose();
        this.tracked.delete(id);
      }
    }
    for (const e of entities) {
      let t = this.tracked.get(e.id);
      if (!t) {
        t = {};
        this.tracked.set(e.id, t);
      }

      // Mesh
      if (e.mesh) {
        if (!t.mesh || t.meshKind !== e.mesh.kind) {
          t.mesh?.dispose();
          t.mesh = buildMesh(this.scene, e);
          t.meshKind = e.mesh.kind;
          const mat = new StandardMaterial(`${e.id}_mat`, this.scene);
          t.mesh.material = mat;
        }
        const mat = t.mesh.material as StandardMaterial;
        const color = Color3.FromHexString(e.mesh.color);
        if (e.trigger?.enabled) {
          // Trigger volume: green wireframe sensor, editor-only (never drawn by the
          // game camera) but still present in the scene for intersection tests.
          mat.wireframe = true;
          mat.disableLighting = true;
          mat.emissiveColor = new Color3(0.22, 0.95, 0.55);
          mat.diffuseColor = new Color3(0, 0, 0);
          mat.specularColor = new Color3(0, 0, 0);
          mat.alpha = 0.6;
          t.mesh.layerMask = EDITOR_LAYER;
        } else {
          // Normal mesh — reset anything a trigger toggle may have set.
          mat.wireframe = false;
          mat.alpha = 1;
          t.mesh.layerMask = DEFAULT_LAYER;
          if (this.mode === '2d') {
            // Flat, unlit fill — the classic 2D sprite look (no light required).
            mat.diffuseColor = new Color3(0, 0, 0);
            mat.specularColor = new Color3(0, 0, 0);
            mat.emissiveColor = color;
            mat.disableLighting = true;
          } else {
            mat.diffuseColor = color;
            mat.emissiveColor = new Color3(0, 0, 0);
            mat.disableLighting = false;
          }
        }
        t.mesh.setEnabled(e.mesh.visible);
        if (!opts.skipTransforms) this.applyTransform(t.mesh, e.transform);
      } else if (t.mesh) {
        t.mesh.dispose();
        t.mesh = undefined;
        t.meshKind = undefined;
      }

      // Light
      if (e.light) {
        if (!t.light || t.lightKind !== e.light.kind) {
          t.light?.dispose();
          t.light = this.buildLight(e);
          t.lightKind = e.light.kind;
        }
        t.light.diffuse = Color3.FromHexString(e.light.color);
        t.light.intensity = e.light.intensity;
        this.applyLightTransform(t.light, e);
      } else if (t.light) {
        t.light.dispose();
        t.light = undefined;
        t.lightKind = undefined;
      }
    }
  }

  private buildLight(e: Entity): Light {
    const p = e.transform.position;
    const kind = e.light!.kind;
    if (kind === 'hemispheric') return new HemisphericLight(e.id, new Vector3(0, 1, 0), this.scene);
    if (kind === 'point') return new PointLight(e.id, new Vector3(p.x, p.y, p.z), this.scene);
    return new DirectionalLight(e.id, new Vector3(-0.5, -1, -0.3), this.scene);
  }

  private applyLightTransform(light: Light, e: Entity) {
    const p = e.transform.position;
    if (light instanceof PointLight) light.position.set(p.x, p.y, p.z);
    if (light instanceof DirectionalLight) {
      const r = e.transform.rotation;
      light.direction = new Vector3(
        Math.sin(r.y * DEG) * Math.cos(r.x * DEG),
        -Math.sin(r.x * DEG) - 0.4,
        Math.cos(r.y * DEG),
      ).normalize();
    }
  }

  private applyTransform(mesh: AbstractMesh, t: Entity['transform']) {
    mesh.position.set(t.position.x, t.position.y, t.position.z);
    // Clear any quaternion the rotation gizmo set so euler rotation stays authoritative.
    mesh.rotationQuaternion = null;
    mesh.rotation.set(t.rotation.x * DEG, t.rotation.y * DEG, t.rotation.z * DEG);
    mesh.scaling.set(t.scale.x, t.scale.y, t.scale.z);
  }

  /** Snapshot transforms so Play can be reverted non-destructively. */
  snapshotTransforms(entities: Entity[]) {
    this.snapshot.clear();
    for (const e of entities) this.snapshot.set(e.id, structuredClone(e.transform));
  }

  restoreTransforms() {
    for (const [id, t] of this.snapshot) {
      const tracked = this.tracked.get(id);
      if (tracked?.mesh) this.applyTransform(tracked.mesh, t);
    }
  }

  dispose() {
    this.clearEffects();
    this.engine.stopRenderLoop();
    this.scene.dispose();
    this.engine.dispose();
  }
}
