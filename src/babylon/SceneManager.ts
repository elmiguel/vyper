import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
import { Vector3, Color4 } from '@babylonjs/core/Maths/math';
import type { PhysicsBody } from '@babylonjs/core/Physics/v2/physicsBody';
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
import { applyEditorRenderGating } from './sceneViewHelpers';
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
import { createEditorCamera, createGameCamera, setupEditorPanControls, applyGameCameraTransform } from './cameraRig';
import { applyNavigation, type NavHandles } from './mayaCamera';
import {
  createGrid,
  createGameCameraHelper,
  applyTransform,
  GAME_CAMERA_ID,
} from './sceneBuilders';
import { gameConsole } from '@/store/consoleStore';
import { SelectionController } from './SelectionController';
import { RenderController } from './RenderController';
import type { SelectionPrefs, GridPrefs } from '@/store/editorPrefs';

export class SceneManager {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly mode: GameMode;
  readonly editorCamera: ArcRotateCamera;
  readonly gameCamera: UniversalCamera;
  /** Half-height (world units) of the 2D orthographic game view. */
  private gameOrthoSize = 6;
  /** Viewport selection visuals + transform gizmos (highlight layer, gizmo manager, snapping,
   *  picking, transform-reporting). See SelectionController. */
  private selection: SelectionController;
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
  private grid?: AbstractMesh;
  /** Last-applied grid visibility, re-asserted after a grid rebuild (applyGridPrefs). */
  private gridVisible = true;
  private gameCamHelper?: Mesh;

  /** Hidden WebGL backbuffer. Babylon copies it into each registered 2D view canvas. */
  private master: HTMLCanvasElement;

  // Physics (Havok) and particle VFX are managed by dedicated helpers.
  private physics: PhysicsManager;
  private effects: EffectsManager;
  /** High-quality 3D render output: HQ pipeline, look-previews, thumbnails. See RenderController. */
  private render: RenderController;
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

    this.selection = new SelectionController({
      scene: this.scene,
      editorCamera: this.editorCamera,
      mode: this.mode,
      cam2dZ: this.CAM2D_Z,
      tracked: this.tracked,
      gameCamHelper: () => this.gameCamHelper,
      meshEdit: () => this.meshEdit,
    });

    this.grid = createGrid(this.scene, this.mode);
    this.gameCamHelper = createGameCameraHelper(this.scene, this.mode, this.gameOrthoSize);

    this.render = new RenderController({
      scene: this.scene,
      engine: this.engine,
      editorCamera: this.editorCamera,
      gameCamera: this.gameCamera,
      mode: this.mode,
      master: this.master,
      tracked: this.tracked,
    });

    // Sculpt/Edit-Mode/rig tools are 3D-only; 2D keeps its flat, unlit look.
    if (this.mode === '3d') {
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
        highlight: this.selection.highlight,
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
      this.onPick?.(this.selection.pickAtPointer());
    });

    // The visible editor canvas is a registered view (editor camera). Render
    // continuously (skipping only a hidden tab) — the camera's frame-based inertia needs
    // an even cadence; idle cost is held down by on-demand shadows instead.
    this.engine.registerView(canvas, this.editorCamera);
    this.engine.inputElement = canvas;
    this.engine.runRenderLoop(() => {
      if (typeof document !== 'undefined' && document.hidden) return; // hidden tab → no work
      if (this.rigPlayer.active) this.rigPlayer.tick(performance.now());
      this.render.renderFrame();
    });
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

  /** Register a canvas previewing the live scene graded by `settings` (Game Style browser).
   *  3D only; no-op teardown in 2D. See RenderController.registerLookPreview. */
  registerLookPreview(canvas: HTMLCanvasElement, settings: RenderSettings): () => void {
    return this.render.registerLookPreview(canvas, settings);
  }

  // ===== Physics + effects: thin pass-throughs to the dedicated managers =====
  loadHavok() {
    return this.physics.loadHavok();
  }
  enablePhysics(entities: Entity[]): Promise<void> {
    // Play moves objects → shadows must re-render every frame.
    this.render.setShadowsLive(true);
    return this.physics.enablePhysics(entities);
  }
  disablePhysics(): void {
    this.physics.disablePhysics();
    // Back to editing → shadows refresh on-demand (per edit), not every frame.
    this.render.setShadowsLive(false);
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

  /** Pick whatever the cursor is over (selection + context menu); see SelectionController. */
  pickAtPointer(): string | null {
    return this.selection.pickAtPointer();
  }

  setGridVisible(visible: boolean) {
    this.gridVisible = visible;
    this.grid?.setEnabled(visible);
  }

  /** Apply grid appearance prefs. The line grid is baked once, so extent/cell-size changes
   *  require a rebuild; dispose the old mesh and recreate it, then re-assert visibility. */
  applyGridPrefs(p: GridPrefs) {
    this.grid?.dispose();
    this.grid = createGrid(this.scene, this.mode, {
      extent: p.extent,
      cellSize: p.cellSize,
      color: p.color,
      opacity: p.opacity,
    });
    this.grid.setEnabled(this.gridVisible);
  }

  /** Toggle Maya-style alt-drag navigation (used by the 3D Modeling area). */
  setMayaNavigation(on: boolean) {
    if (on === this.mayaNavOn) return;
    this.mayaNavOn = on;
    this.navHandles = applyNavigation(on, this.editorCamera, this.editorCanvas, this.isPlayingFn, this.navHandles);
  }

  /** Apply scene-wide high-quality render settings (post-processing/shadows/IBL). No-op in 2D. */
  applyRenderSettings(s: RenderSettings) {
    this.render.applyRenderSettings(s);
  }

  /** Toggle camera post-processing in the scene render (muted in place). No-op in 2D. */
  setEditorEffects(on: boolean) {
    this.render.setEditorEffects(on);
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
    this.selection.setOnTransform(cb);
  }

  /** Hook to write game-camera moves (via its editor helper) back to the store. */
  setOnCameraTransform(cb: (patch: { position: Vec3; rotation: Vec3 }) => void) {
    this.selection.setOnCameraTransform(cb);
  }

  /** Switch the active transform gizmo (move / rotate / scale / select). */
  setGizmoMode(mode: GizmoMode) {
    this.selection.setGizmoMode(mode);
  }

  /** Toggle grid snapping for transform-gizmo drags (see SelectionController). */
  setSnapping(on: boolean): void {
    this.selection.setSnapping(on);
  }

  /** Frame the editor camera on an entity/editor object (or reset if none). */
  focusOn(id: string | null) {
    this.selection.focusOn(id);
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
    return this.render.captureThumbnail(width);
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

  /** Highlight (and attach gizmos to) the selected object; see SelectionController. */
  highlightSelection(id: string | null) {
    this.selection.highlightSelection(id);
  }

  /** Apply the user's selection-highlight prefs (inner glow, colors, blur, opacity). */
  applySelectionPrefs(p: SelectionPrefs) {
    this.selection.applySelectionPrefs(p);
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
    this.render.syncShadows(this.tracked.values());
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
    this.render.dispose();
    this.engine.stopRenderLoop();
    this.scene.dispose();
    this.engine.dispose();
  }
}
