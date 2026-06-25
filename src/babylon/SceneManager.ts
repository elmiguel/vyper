import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
import { Vector3, Color3, Color4 } from '@babylonjs/core/Maths/math';
import type { PhysicsBody } from '@babylonjs/core/Physics/v2/physicsBody';
import { GizmoManager } from '@babylonjs/core/Gizmos/gizmoManager';
import { HighlightLayer } from '@babylonjs/core/Layers/highlightLayer';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
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

import type { Asset, BooleanOp, BrushParams, CustomGeometry, Entity, EffectConfig, GameMode, GizmoMode, RenderSettings, TerrainConfig, Vec3 } from '@/types';
import { PhysicsManager } from './PhysicsManager';
import { RenderPipeline } from './RenderPipeline';
import { isPickable, nextPick, pickIdsFromHits } from './meshPicking';
import { applyEditorRenderGating, focusCameraOn, readGizmoTransform } from './sceneViewHelpers';
import * as ops from './runtimeEntityOps';
import type { RuntimeOpsCtx } from './runtimeEntityOps';
import { SpawnPool } from '../runtime/SpawnPool';
import { createSpawnInstance, placeSpawnInstance } from './spawnerRuntimeOps';
import { syncEntityMaterial, type MatKind } from './materials';
import { SculptController } from './SculptController';
import { MeshEditController } from './MeshEditController';
import { RigController } from './RigController';
import { RigPlayer, type ClipPlayRequest } from './RigPlayer';
import { reconcileEntities, type Tracked } from './sceneSync';
import { bakeBoolean } from './csg';
import { hardwareScalingLevelFor } from './viewResize';
import { ModelLoader, loadModelInto, type ModelContext } from './modelLoader';
import { EffectsManager } from './EffectsManager';
import { createEditorCamera, createGameCamera, configureGizmos, setupEditorPanControls, applyGameCameraTransform, type WiredGizmos } from './cameraRig';
import { applyNavigation, type NavHandles } from './mayaCamera';
import {
  CAM_HELPER_COLOR,
  createGrid,
  createGameCameraHelper,
  applyTransform,
  GAME_CAMERA_ID,
} from './sceneBuilders';
import { canvasThumbnail } from './thumbnail';
import { gameConsole } from '@/store/consoleStore';

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
  /** Runtime two-pool spawn queue (Spawner feature). Empty until Play registers spawners; the
   *  Babylon glue (clone/place/hide/dispose) is wired here, the queue logic lives in SpawnPool. */
  private readonly spawnPool = new SpawnPool({
    createInstance: (targetId, instanceId) =>
      createSpawnInstance({ tracked: this.tracked, scene: this.scene }, targetId, instanceId),
    setInstanceActive: (id, on) => this.setEntityActive(id, on),
    placeAtSpawner: (id, spawnerId) => {
      const sp = this.getMesh(spawnerId);
      if (sp) placeSpawnInstance({ tracked: this.tracked, scene: this.scene }, id, sp.absolutePosition.clone());
    },
    hideSource: (targetId) => this.setEntityActive(targetId, false),
    disposeInstance: (id) => this.destroyRuntimeEntity(id),
  });
  /** Loads/instantiates external 3D model assets (kind:'model'). */
  private models: ModelLoader;
  /** Asset definitions by id, kept in sync from the store (see setAssetLibrary). */
  private assets = new Map<string, Asset>();
  private onPick?: (id: string | null) => void;
  private onTransform?: (id: string, patch: Partial<Entity['transform']>) => void;
  private onCameraTransform?: (patch: { position: Vec3; rotation: Vec3 }) => void;
  private grid?: AbstractMesh;
  private gameCamHelper?: Mesh;
  private selectedId: string | null = null;
  private gizmoMode: GizmoMode = 'move';
  private wiredGizmos: WiredGizmos = { move: false, rotate: false, scale: false };
  /** Grid snapping for gizmo drags (toggled from the viewport magnet button). */
  private snapOn = false;

  /** Hidden WebGL backbuffer. Babylon copies it into each registered 2D view canvas. */
  private master: HTMLCanvasElement;

  // Physics (Havok) and particle VFX are managed by dedicated helpers.
  private physics: PhysicsManager;
  private effects: EffectsManager;
  /** High-quality 3D rendering (post-processing, shadows, IBL). 3D mode only. */
  private renderPipeline?: RenderPipeline;
  /** Most recent render settings applied (re-used when the editor-effects toggle flips). */
  private lastRender?: RenderSettings;
  /** Editor-session toggle: when false, post-processing is suppressed in the scene render. */
  private editorEffectsOn = true;
  /** Terrain sculpt tool (3D only). */
  private sculpt?: SculptController;
  private onSculptCommit?: (entityId: string, heights: number[]) => void;
  /** Polygon Edit Mode + rigging tools (3D only). Driven directly from engine.ts. */
  private meshEdit?: MeshEditController;
  private rig?: RigController;
  /** Runtime skeletal-clip playback (CPU skinning), ticked in the render loop. */
  private rigPlayer: RigPlayer;
  /** The visible game-preview canvas, used as the pointer-lock target. */
  private previewCanvas: HTMLCanvasElement | null = null;
  /** Teardowns for the active navigation scheme (default pan / Maya alt-drag). */
  private navHandles: NavHandles = {};
  /** The editor viewport canvas (kept for toggling navigation schemes). */
  private editorCanvas: HTMLCanvasElement;
  private isPlayingFn: () => boolean;
  private mayaNavOn = false;

  /** True between enablePhysics() and disablePhysics() (i.e. during Play). */
  get physicsActive(): boolean {
    return this.physics.physicsActive;
  }

  constructor(canvas: HTMLCanvasElement, mode: GameMode = '3d', isPlaying: () => boolean = () => false) {
    this.mode = mode;
    this.editorCanvas = canvas;
    this.isPlayingFn = isPlaying;
    // Multi-view: the engine renders to a hidden master WebGL canvas and copies into
    // each registered view; the visible editor canvas is registered below. The generous
    // default size avoids a low-res first frame before per-view dprResize runs.
    this.master = document.createElement('canvas');
    this.master.width = 2560;
    this.master.height = 1440;

    this.engine = new Engine(this.master, true, { preserveDrawingBuffer: true, stencil: true });
    // Native-pixel-ratio rendering (capped 2×) via hardwareScalingLevel — multi-view
    // resize and the picking ray both divide by it, keeping resolution + clicks in sync.
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1;
    this.engine.setHardwareScalingLevel(hardwareScalingLevelFor(dpr));
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.05, 0.06, 0.09, 1);
    // Selection picks on pointer-DOWN only (see onPointerObservable), so skip
    // Babylon's default raycast on every pointer-move — a real saving while the
    // cursor moves over the viewport.
    this.scene.skipPointerMovePicking = true;

    this.physics = new PhysicsManager({
      scene: this.scene,
      mode: this.mode,
      getMesh: (id) => this.getMesh(id),
      getMeshKind: (id) => this.tracked.get(id)?.meshKind,
    });
    this.effects = new EffectsManager({ scene: this.scene, getMesh: (id) => this.getMesh(id) });
    this.models = new ModelLoader(this.scene);
    this.rigPlayer = new RigPlayer(this.scene, (id) => this.getMesh(id));

    this.editorCamera = createEditorCamera(this.scene, this.mode, canvas);
    this.gameCamera = createGameCamera(this.scene, this.mode, this.CAM2D_Z);
    this.scene.activeCamera = this.editorCamera;
    this.navHandles = { pan: setupEditorPanControls(canvas, this.editorCamera, isPlaying) };

    this.highlight = new HighlightLayer('hl', this.scene);

    this.gizmos = new GizmoManager(this.scene);
    this.gizmos.usePointerToAttachGizmos = false;
    this.setGizmoMode('move');

    this.grid = createGrid(this.scene, this.mode);
    this.gameCamHelper = createGameCameraHelper(this.scene, this.mode, this.gameOrthoSize);

    // High-quality rendering is 3D-only; 2D keeps its flat, unlit look.
    if (this.mode === '3d') {
      this.renderPipeline = new RenderPipeline(this.scene, [this.editorCamera, this.gameCamera]);
      this.sculpt = new SculptController(
        this.scene,
        this.editorCamera,
        canvas,
        (id) => this.tracked.get(id)?.mesh as Mesh | undefined,
        (id, heights) => this.onSculptCommit?.(id, heights),
      );
      this.meshEdit = new MeshEditController(this.scene, this.editorCamera, canvas, (id) => this.getMesh(id));
      this.rig = new RigController(this.scene, this.editorCamera, (id) => this.getMesh(id));
    }

    // Editor-only overlays gated to the editor camera + 2D ortho frustum upkeep.
    this.scene.onBeforeCameraRenderObservable.add((cam) =>
      applyEditorRenderGating(cam, {
        editorCamera: this.editorCamera,
        highlight: this.highlight,
        engine: this.engine,
        mode: this.mode,
        gameOrthoSize: this.gameOrthoSize,
      }),
    );

    // Picking → selection (through the editor camera). Edit-Mode / sculpt tools get
    // first crack at the pointer; right button is reserved for the context menu.
    this.scene.onPointerObservable.add((info) => {
      if (this.meshEdit?.routePointer(info)) return;
      if (this.sculpt?.routePointer(info)) return;
      if (info.type !== 1 /* POINTERDOWN */) return;
      if ((info.event as PointerEvent).button === 2) return;
      this.onPick?.(this.pickAtPointer());
    });

    // The visible editor canvas is a registered view (editor camera). Render
    // continuously (skipping only a hidden tab) — the camera's frame-based inertia needs
    // an even cadence; idle cost is held down by on-demand shadows instead.
    this.engine.registerView(canvas, this.editorCamera);
    this.engine.inputElement = canvas;
    this.engine.runRenderLoop(() => {
      if (typeof document !== 'undefined' && document.hidden) return; // hidden tab → no work
      if (this.rigPlayer.active) this.rigPlayer.tick(performance.now());
      this.renderFrameSafely();
    });
  }

  /**
   * Render one frame, tolerating the transient window after a post-process pipeline is created.
   * With parallel (async) shader compilation, a render effect's `_effect` is briefly null while
   * its shader compiles; the PostProcessRenderPipelineManager reads `postProcess.isSupported`
   * (→ `_effect.isSupported`) during `_gatherRenderTargets` and throws on that null for a frame or
   * two. The condition self-heals once the shader finishes, so we swallow the throw for those
   * frames (throttled logging) instead of letting it kill the whole render loop. Any other render
   * error is logged and rethrown.
   */
  private renderFrameSafely(): void {
    try {
      this.scene.render();
      this.renderErrorFrames = 0;
    } catch (err) {
      const msg = String((err as Error)?.message ?? err);
      const isCompileRace = msg.includes("reading 'isSupported'") || msg.includes('isSupported');
      if (!isCompileRace) throw err;
      // Transient post-process compile race: skip this frame; it renders next frame.
      if (this.renderErrorFrames < 3) console.warn('[SceneManager] post-process not ready this frame, skipping:', msg);
      this.renderErrorFrames++;
      // If it never recovers (~1s of failures), the post-processing pipeline is genuinely broken —
      // tear it down so the raw scene stays visible rather than leaving a silent black viewport.
      if (this.renderErrorFrames === 60) {
        console.error('[SceneManager] post-processing kept failing; disabling effects to recover the view.');
        this.renderPipeline?.recoverByDisablingEffects();
      }
    }
  }
  private renderErrorFrames = 0;

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

  // ===== Physics + effects: thin pass-throughs to the dedicated managers =====
  loadHavok() {
    return this.physics.loadHavok();
  }
  enablePhysics(entities: Entity[]): Promise<void> {
    // Play moves objects → shadows must re-render every frame.
    this.renderPipeline?.setShadowsLive(true);
    return this.physics.enablePhysics(entities);
  }
  disablePhysics(): void {
    this.physics.disablePhysics();
    // Back to editing → shadows refresh on-demand (per edit), not every frame.
    this.renderPipeline?.setShadowsLive(false);
  }
  ensureBody(entityId: string, opts: Parameters<PhysicsManager['ensureBody']>[1] = {}): PhysicsBody | null {
    return this.physics.ensureBody(entityId, opts);
  }
  getBody(entityId: string): PhysicsBody | null {
    return this.physics.getBody(entityId);
  }
  physicsRaycastDistance(from: Vector3, to: Vector3): number {
    return this.physics.physicsRaycastDistance(from, to);
  }
  setPhysicsPaused(paused: boolean): void {
    this.physics.setPaused(paused);
  }

  requestPointerLock(): void {
    this.previewCanvas?.requestPointerLock?.();
  }

  exitPointerLock(): void {
    if (typeof document !== 'undefined' && document.pointerLockElement) document.exitPointerLock();
  }

  /** Begin runtime CPU-skinned playback of a skeletal clip on an entity. */
  startClip(entityId: string, req: ClipPlayRequest): void {
    this.rigPlayer.start(entityId, req, performance.now());
  }
  stopClip(entityId: string): void {
    this.rigPlayer.stop(entityId);
  }
  clearClips(): void {
    this.rigPlayer.clear();
  }

  playEffect(entityId: string, config: EffectConfig): void {
    this.effects.playEffect(entityId, config);
  }
  stopEffect(entityId: string): void {
    this.effects.stopEffect(entityId);
  }
  clearEffects(): void {
    this.effects.clearEffects();
  }

  private meshForSelection(id: string | null): AbstractMesh | undefined {
    if (!id) return undefined;
    if (id === GAME_CAMERA_ID) return this.gameCamHelper;
    return this.tracked.get(id)?.mesh;
  }

  /** Last click position, so repeated clicks at the same spot cycle through
   *  stacked objects instead of always grabbing the topmost. */
  private lastPick = { x: -1, y: -1 };

  /** Pick whatever the cursor is over (selection + context menu). Returns the
   *  nearest object; clicking the same spot again cycles to the next object behind
   *  it, so overlapping objects can each be selected (and moved aside). */
  pickAtPointer(): string | null {
    const x = this.scene.pointerX;
    const y = this.scene.pointerY;
    const ids = pickIdsFromHits(this.scene.multiPick(x, y, (m) => isPickable(m, this.tracked), this.editorCamera) ?? []);
    const samePoint = Math.abs(x - this.lastPick.x) < 4 && Math.abs(y - this.lastPick.y) < 4;
    this.lastPick = { x, y };
    return nextPick(ids, this.selectedId, samePoint);
  }

  setGridVisible(visible: boolean) {
    this.grid?.setEnabled(visible);
  }

  /** Toggle Maya-style alt-drag navigation (used by the 3D Modeling area). */
  setMayaNavigation(on: boolean) {
    if (on === this.mayaNavOn) return;
    this.mayaNavOn = on;
    this.navHandles = applyNavigation(on, this.editorCamera, this.editorCanvas, this.isPlayingFn, this.navHandles);
  }

  /** Apply scene-wide high-quality render settings (post-processing/shadows/IBL).
   *  No-op in 2D. Re-syncs shadow casters so a shadows toggle takes effect at once. */
  applyRenderSettings(s: RenderSettings) {
    this.lastRender = s;
    if (!this.renderPipeline) return;
    this.renderPipeline.apply(s);
    // The editor-effects toggle MUTES the post-processing in place (flag flips on
    // the live pipeline) rather than disposing/detaching it — disposing mid-frame
    // froze the multi-view render loop and detaching blanked the view. The saved
    // settings are untouched, so toggling back on restores the authored look.
    this.renderPipeline.setEffectsMuted(!this.editorEffectsOn, s);
    this.renderPipeline.syncShadows(this.tracked.values());
  }

  /** Toggle camera post-processing in the scene render (muted in place). No-op in 2D. */
  setEditorEffects(on: boolean) {
    if (this.editorEffectsOn === on) return;
    this.editorEffectsOn = on;
    if (this.lastRender) this.applyRenderSettings(this.lastRender);
  }

  /** Where committed sculpt heightfields are written back (→ store.updateTerrain). */
  setOnSculptCommit(cb: (entityId: string, heights: number[]) => void) {
    this.onSculptCommit = cb;
  }
  /** Toggle the terrain sculpt tool for an entity (no-op in 2D). */
  setSculpt(active: boolean, entityId: string | null, terrain: TerrainConfig | null, brush: BrushParams) {
    this.sculpt?.setTarget(active, entityId, terrain, brush);
  }
  /** Update the live sculpt brush. */
  setBrush(brush: BrushParams) {
    this.sculpt?.setBrush(brush);
  }

  // Edit Mode + rigging controllers (3D only; undefined in 2D). engine.ts wires them.
  get meshEditController(): MeshEditController | undefined {
    return this.meshEdit;
  }
  get rigController(): RigController | undefined {
    return this.rig;
  }

  /** Combine two entities' meshes with a boolean op; returns baked geometry for a
   *  new custom mesh (world-space), or null if either mesh lacks geometry. */
  async applyBoolean(aId: string, bId: string, op: BooleanOp): Promise<CustomGeometry | null> {
    const a = this.tracked.get(aId)?.mesh as Mesh | undefined;
    const b = this.tracked.get(bId)?.mesh as Mesh | undefined;
    if (!a || !b || a.getTotalVertices() === 0 || b.getTotalVertices() === 0) return null;
    return bakeBoolean(this.scene, a, b, op);
  }

  /** Fixed -Z distance of the 2D orthographic game camera from the play plane. */
  private readonly CAM2D_Z = -10;

  /** Apply the store's game-camera transform to both the real camera and its helper. */
  applyGameCamera(t: { position: Vec3; rotation: Vec3 }) {
    applyGameCameraTransform(this.gameCamera, this.gameCamHelper, this.mode, t, this.CAM2D_Z);
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

  /** Read the attached mesh's full transform and report it to the store. */
  private reportTransform = () => {
    const mesh = this.gizmos.attachedMesh;
    if (!mesh) return;
    const t = readGizmoTransform(mesh, this.mode, this.CAM2D_Z);
    if (t.kind === 'camera') this.onCameraTransform?.({ position: t.position, rotation: t.rotation });
    else this.onTransform?.(mesh.name, { position: t.position, rotation: t.rotation, scale: t.scale });
  };

  /** Switch the active transform gizmo (move / rotate / scale / select). */
  setGizmoMode(mode: GizmoMode) {
    this.gizmoMode = mode;
    this.gizmos.positionGizmoEnabled = mode === 'move';
    this.gizmos.rotationGizmoEnabled = mode === 'rotate';
    this.gizmos.scaleGizmoEnabled = mode === 'scale';
    configureGizmos(this.gizmos, this.mode, this.wiredGizmos, this.reportTransform);
    this.applySnap(); // a newly-enabled gizmo must pick up the current snap setting
    this.reattachGizmo();
    // In Edit Mode the entity gizmo has nothing to attach to (the mesh is disabled); the same
    // move/rotate/scale choice drives the component gizmo instead.
    this.meshEdit?.setGizmoMode(mode);
  }

  /** Toggle grid snapping for the transform gizmos: drags snap to fixed increments
   *  (1 unit move, 15° rotate, 0.25 scale) when on, free movement when off. */
  setSnapping(on: boolean): void {
    this.snapOn = on;
    this.applySnap();
  }

  /** Push the current snap increments onto whichever gizmos exist (they're created
   *  lazily when their mode is first enabled, so re-apply on mode change too). */
  private applySnap(): void {
    const g = this.gizmos.gizmos;
    if (g.positionGizmo) g.positionGizmo.snapDistance = this.snapOn ? 1 : 0;
    if (g.rotationGizmo) g.rotationGizmo.snapDistance = this.snapOn ? Math.PI / 12 : 0; // 15°
    if (g.scaleGizmo) g.scaleGizmo.snapDistance = this.snapOn ? 0.25 : 0;
  }

  private reattachGizmo() {
    const mesh = this.meshForSelection(this.selectedId);
    this.gizmos.attachToMesh((mesh as Mesh) ?? null);
  }

  /** Frame the editor camera on an entity/editor object (or reset if none). */
  focusOn(id: string | null) {
    focusCameraOn(this.editorCamera, this.meshForSelection(id) as AbstractMesh | undefined);
  }

  resize() {
    // Registered views auto-resize to their canvas client size each frame
    // (see _renderViewStep), so no explicit engine.resize() is needed — and
    // calling it would size the detached master canvas to 0×0.
  }

  getMesh(id: string): AbstractMesh | undefined {
    return this.tracked.get(id)?.mesh;
  }

  /** Grab the last rendered viewport frame as a downscaled JPEG data URL, for use
   *  as a project cover thumbnail. Reads the hidden master backbuffer directly —
   *  `preserveDrawingBuffer` keeps the latest frame available. Returns null if the
   *  engine hasn't drawn yet or a 2D canvas isn't available. */
  captureThumbnail(width = 480): string | null {
    return canvasThumbnail(this.master, width);
  }

  // ----- Runtime entity control (cross-entity scripts / triggers / volumes) -----
  // Logic lives in runtimeEntityOps.ts; these delegate with a small context.
  private get runtimeCtx(): RuntimeOpsCtx {
    return { tracked: this.tracked, physics: this.physics, effects: this.effects };
  }
  setEntityVisible(id: string, visible: boolean): void {
    ops.setEntityVisible(this.runtimeCtx, id, visible);
  }
  setEntityActive(id: string, active: boolean): void {
    ops.setEntityActive(this.runtimeCtx, id, active);
  }
  repositionEntity(id: string, worldPos: Vector3): void {
    ops.repositionEntity(this.runtimeCtx, id, worldPos);
  }
  constrainEntity(id: string, worldPos: Vector3, worldNormal: Vector3): void {
    ops.constrainEntity(this.runtimeCtx, id, worldPos, worldNormal);
  }
  destroyRuntimeEntity(id: string): void {
    ops.destroyRuntimeEntity(this.runtimeCtx, id);
  }

  // ----- Spawner pools (runtime; see SpawnPool) -----
  /** Register every spawner with a target at Play start: hide each source object into its pool
   *  and pre-warm as configured. Instances are runtime-only, so Stop discards them. */
  initSpawners(entities: Entity[]): void {
    const specs = entities.filter((e) => e.spawner?.targetId);
    // A spawner's target is pooled (hidden) at Play and only appears via spawn(). That silently
    // hid players when a Spawner was pointed at them — surface it so it's never a mystery.
    for (const e of specs) {
      const t = entities.find((x) => x.id === e.spawner!.targetId);
      const playerish = t && (t.tag === 'player' || t.scriptIds.length > 0);
      gameConsole[playerish ? 'warn' : 'info'](
        'spawner',
        `"${e.name}" pools "${t?.name ?? e.spawner!.targetId}" — it's hidden until spawned` +
          (playerish ? '. If this is your controlled object, remove the spawner or retarget it (it won\'t render or be hit by volumes).' : '.'),
      );
    }
    this.spawnPool.register(
      specs.map((e) => ({ spawnerId: e.id, targetId: e.spawner!.targetId!, prewarm: e.spawner!.prewarm })),
    );
  }
  /** Tear down all spawned instances (on Stop). */
  resetSpawners(): void {
    this.spawnPool.reset();
  }
  /** Deploy one instance from a spawner; returns its runtime instance id (or null). */
  spawnFromSpawner(spawnerId: string): string | null {
    return this.spawnPool.spawn(spawnerId);
  }
  /** Return a spawned instance to its pool for reuse; returns false if it isn't a live instance. */
  despawnInstance(instanceId: string): boolean {
    return this.spawnPool.despawn(instanceId);
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
  /** Context handed to the model-sync free functions (see modelLoader.ts). */
  private modelCtx(): ModelContext {
    return { scene: this.scene, loader: this.models, assets: this.assets };
  }

  /** Update the asset catalogue (from the store) and load any placed models that
   *  were waiting on their asset definition (e.g. a scene loaded before assets). */
  setAssetLibrary(assets: Asset[]) {
    this.assets = new Map(assets.map((a) => [a.id, a]));
    const ctx = this.modelCtx();
    for (const [id, t] of this.tracked) {
      if (t.meshKind === 'model') loadModelInto(ctx, t, id);
    }
  }

  sync(entities: Entity[], opts: { skipTransforms?: boolean } = {}) {
    reconcileEntities(
      { scene: this.scene, mode: this.mode, tracked: this.tracked, modelCtx: () => this.modelCtx() },
      entities,
      opts,
    );
    // Keep shadow casters/receivers in step with the reconciled scene.
    this.renderPipeline?.syncShadows(this.tracked.values());
  }

  /** Snapshot transforms so Play can be reverted non-destructively. */
  snapshotTransforms(entities: Entity[]) {
    this.snapshot.clear();
    for (const e of entities) this.snapshot.set(e.id, structuredClone(e.transform));
  }

  restoreTransforms() {
    for (const [id, t] of this.snapshot) {
      const tracked = this.tracked.get(id);
      if (tracked?.mesh) applyTransform(tracked.mesh, t);
    }
  }

  dispose() {
    this.navHandles.pan?.();
    this.navHandles.maya?.();
    this.clearEffects();
    this.renderPipeline?.dispose();
    this.engine.stopRenderLoop();
    this.scene.dispose();
    this.engine.dispose();
  }
}
