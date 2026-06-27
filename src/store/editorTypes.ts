import type { StoreApi } from 'zustand';
import type {
  Asset,
  AssetLibrary,
  BrushParams,
  Clipboard,
  CustomGeometry,
  EffectConfig,
  Entity,
  GameDesign,
  GameMode,
  GizmoMode,
  HudWidget,
  HudWidgetKind,
  LightKind,
  MaterialConfig,
  MaterialPreset,
  Objective,
  PlayState,
  PrefabDef,
  PrimitiveKind,
  RenderSettings,
  RigSkeleton,
  SkinData,
  SculptBrushParams,
  Script,
  ScriptGraph,
  ScriptMode,
  TerrainConfig,
  Vec3,
  VolumeConfig,
} from '@/types';
import { type KeymapId } from '@/input/keymaps';
import type { EditorPrefs, GridPrefs, SelectionPrefs } from './editorPrefs';
import type { SerializedDockview } from 'dockview';

/** Which mesh component the polygon Edit Mode tool is selecting/operating on. */
export type MeshComponentMode = 'vertex' | 'edge' | 'face';

/** An interactive Edit-Mode tool that takes over viewport pointer input. `select` is
 *  the default (component pick/marquee/gizmo); the rest are modal tools that own viewport input. */
export type MeshEditTool = 'select' | 'loopcut' | 'knife' | 'drawpoly' | 'sketchtopo';

/** A modeling operator invoked from the Modeling Studio tools panel. */
export type MeshEditOpId =
  | 'extrude'
  | 'inset'
  | 'subdivide'
  | 'bevel'
  | 'loopcut'
  | 'delete'
  | 'merge'
  | 'triangulate'
  | 'connect'
  | 'bridge';

/** Polygon Edit Mode state (the Modeling Studio). Editor-session/view state — geometry
 *  commits flow through commitMeshGeometry, which records undo + persists. */
export interface MeshEditState {
  active: boolean;
  entityId: string | null;
  component: MeshComponentMode;
  /** Selected component keys (vertex index, edge key, or face index — as strings). */
  selection: string[];
  /** Active free-form sculpt brush, or null when in component-select mode. */
  sculpt: SculptBrushParams | null;
  /** Active interactive tool (loop cut / knife), or `select` for normal editing. */
  tool: MeshEditTool;
}

/** Rigging + animation session state (the Modeling Studio's Rig/Animate modes). The
 *  RigController owns the live skeleton/preview; this mirrors intent + the playhead. */
export interface RigEditState {
  active: boolean;
  entityId: string | null;
  selectedBone: string | null;
  /** Clip being edited/played (an id into the entity's rig.clips). */
  activeClipId: string | null;
  /** Timeline position in seconds. */
  playhead: number;
  playing: boolean;
  /** Pose pushed to the controller while scrubbing/playing (Euler degrees per bone). */
  scrubPose: Record<string, Vec3> | null;
}

/** Undo history is snapshot-based: each entry captures the editable scene state. */
export interface Snapshot {
  entities: Entity[];
  scripts: Record<string, Script>;
  selectedId: string | null;
}

/** A user-saved named dock arrangement (built-in presets live in code, not here). */
export interface CustomLayout {
  id: string;
  label: string;
  layout: SerializedDockview;
}

/** Dockable-workspace state — persisted per-project in games.settings.workspace. */
export interface Workspace {
  /** Live working arrangement, restored on open. Null until first laid out. */
  layout: SerializedDockview | null;
  /** User-saved named layouts, shown alongside built-in presets. */
  custom: CustomLayout[];
  /** Active preset id (a built-in id or a custom id) — drives menu highlighting. */
  activePresetId: string;
}

export interface EditorState {
  /** 3D or 2D authoring — set when a game opens; drives camera/render/tooling. */
  mode: GameMode;
  entities: Entity[];
  scripts: Record<string, Script>;
  selectedId: string | null;
  /** Selected script tab in the script/node editor. */
  activeScriptId: string | null;
  /** Last script the user opened per entity id, so re-selecting an object reopens that script
   *  (else its first). Lets selection auto-focus a behaviour without manual navigation. */
  lastScriptByEntity: Record<string, string>;
  /** Effect currently open in the Effects editor (entity + effect id), or null. */
  activeEffect: { entityId: string; effectId: string } | null;
  playState: PlayState;
  /** Bumped whenever the scene structure changes, so viewports can resync. */
  sceneRevision: number;
  showInspector3D: boolean;
  /** Keyboard shortcuts cheat-sheet overlay. */
  showShortcuts: boolean;
  /** Game design doc (goals, rules, win/lose, HUD) — game-level, shared across scenes. */
  design: GameDesign;
  /** Whether the goals/design editor overlay is open. */
  showDesign: boolean;
  /** Whether the HUD editor overlay is open. */
  showHud: boolean;
  /** Selected HUD widget in the HUD editor (editor-only state). */
  selectedHudId: string | null;
  /** Whether the guided onboarding tour is running. */
  runTour: boolean;
  /** Editor-session toggle: when false, camera post-processing (bloom, grain,
   *  vignette, SSAO, shadows, IBL) is suppressed in the scene render so authoring
   *  is on a clean view. Not persisted — the game keeps its design.render settings. */
  editorEffects: boolean;
  /** Browsable library of 3D models/textures (built-ins + uploads). */
  assetLibrary: AssetLibrary;
  /** Asset selected in the browser/viewer, or null. */
  selectedAssetId: string | null;
  /** Asset stashed by Copy, available to Paste. Editor-session only. */
  assetClipboard: Asset | null;
  /** Whether the asset browser overlay is open. */
  showAssetBrowser: boolean;
  /** Whether the asset viewer (model/texture/animation) modal is open. */
  showAssetViewer: boolean;
  /** Bumped to ask the viewport to frame the selected object. */
  focusRequest: number;
  /** Active transform gizmo. */
  gizmoMode: GizmoMode;
  /** Whether the terrain sculpt tool is active (left-drag sculpts the selected terrain). */
  sculpting: boolean;
  /** Maya-style viewport navigation (alt+drag orbit/pan/dolly) — on in the Modeler area. */
  mayaNav: boolean;
  /** Current sculpt brush settings. */
  brush: BrushParams;
  /** Polygon Edit Mode (Modeling Studio) state. */
  meshEdit: MeshEditState;
  /** Rigging + animation (Modeling Studio) state. */
  rig: RigEditState;
  /** Active keyboard shortcut layout. */
  keymap: KeymapId;
  /** Game-play camera transform — editable, shown as a helper in the editor view. */
  gameCamera: { position: Vec3; rotation: Vec3 };
  /** Bumped when the game camera moves, so the viewport re-applies it (cheap, no rebuild). */
  cameraRevision: number;
  /** Whether the editor grid is visible (editor-only; never in the game view). */
  gridVisible: boolean;
  /** Per-user editor appearance/UX preferences (localStorage-backed; not part of the game). */
  editorPrefs: EditorPrefs;
  /** Modeling Studio toggle: when false, the solid surface preview is hidden in
   *  Edit Mode so only the wireframe/component overlays show (editing still works). */
  showSurfaces: boolean;
  /** Whether transform gizmo drags snap to grid increments (viewport magnet toggle). */
  snapToGrid: boolean;
  clipboard: Clipboard | null;
  /** Reusable entity templates, game-level (persisted in games.settings.prefabs). */
  prefabs: Record<string, PrefabDef>;
  /** Reusable named materials, game-level (persisted in games.settings.materials). */
  materialPresets: Record<string, MaterialPreset>;
  past: Snapshot[];
  future: Snapshot[];
  /** Dockable workspace layout + saved presets (game-level, persisted in settings). */
  workspace: Workspace;

  // selection
  select: (id: string | null) => void;
  setActiveScript: (id: string | null) => void;

  // editor mode / shortcuts
  setMode: (mode: GameMode) => void;
  setGizmoMode: (mode: GizmoMode) => void;
  setKeymap: (id: KeymapId) => void;
  focusSelected: () => void;
  /** Toggle the terrain sculpt tool. */
  setSculpting: (v: boolean) => void;
  /** Enable/disable Maya-style viewport navigation. */
  setMayaNav: (v: boolean) => void;
  /** Toggle grid snapping for transform gizmo drags. */
  toggleSnapToGrid: () => void;
  /** Patch the sculpt brush settings. */
  setBrush: (patch: Partial<BrushParams>) => void;

  // polygon Edit Mode (Modeling Studio)
  /** Enter Edit Mode for an entity's mesh (vertex/edge/face editing). */
  beginMeshEdit: (entityId: string) => void;
  /** Exit Edit Mode, committing the final geometry. */
  endMeshEdit: () => void;
  /** Switch the active component type; clears the selection and any sculpt brush. */
  setMeshComponent: (mode: MeshComponentMode) => void;
  /** Set/clear the free-form sculpt brush (null returns to component-select mode). */
  setMeshSculptBrush: (brush: SculptBrushParams | null) => void;
  /** Activate an interactive tool (loop cut / knife), or `select` to return to editing. */
  setMeshTool: (tool: MeshEditTool) => void;
  /** Record the live component selection (called by the scene controller). */
  setMeshSelection: (mode: MeshComponentMode, keys: string[]) => void;
  /** Write edited geometry back to an entity (records undo; rebuilds when not active). */
  commitMeshGeometry: (entityId: string, geo: CustomGeometry) => void;
  /** Save baked geometry to the asset library as a reusable generated model; returns its id. */
  saveMeshToLibrary: (name: string, geo: CustomGeometry) => string;
  /** Save a Modeling-Studio object (geometry + its material/colour) as a generated asset, and
   *  ensure the material's texture maps are represented in the library; returns the asset id.
   *  Pass `existingId` to update that asset in place (republish, keeping its id + reference flag). */
  saveModelerObjectAsset: (name: string, geo: CustomGeometry, material: MaterialConfig | undefined, color: string, existingId?: string) => string;

  // rigging + animation (Modeling Studio)
  /** Enter Rig Mode for an entity (build/pose a skeleton, paint weights). */
  beginRig: (entityId: string) => void;
  endRig: () => void;
  /** Select a bone (drives the pose gizmo). */
  selectRigBone: (boneId: string | null) => void;
  /** Persist the controller's skeleton/skin/pose onto the entity. */
  commitRig: (entityId: string, skeleton: RigSkeleton, skin: SkinData, pose: Record<string, Vec3>) => void;
  /** Create a new (empty) animation clip on the rigged entity; returns its id. */
  addClip: (name?: string) => string;
  setActiveClip: (clipId: string | null) => void;
  /** Key the current pose of every bone into the active clip at the playhead. */
  keyframeBones: () => void;
  /** Move the timeline playhead (seconds) and push the sampled pose to the viewport. */
  setPlayhead: (time: number) => void;
  setRigPlaying: (playing: boolean) => void;

  // editor objects
  updateGameCamera: (patch: Partial<{ position: Vec3; rotation: Vec3 }>) => void;
  resetGameCamera: () => void;
  toggleGrid: () => void;
  /** Toggle camera post-processing in the editor scene view (see editorEffects). */
  toggleEditorEffects: () => void;
  /** Toggle the solid surface preview in Modeling Studio Edit Mode (see showSurfaces). */
  toggleSurfaces: () => void;

  // history & clipboard
  record: (label: string) => void;
  undo: () => void;
  redo: () => void;
  copySelected: () => void;
  paste: () => void;

  // entity ops
  addPrimitive: (kind: PrimitiveKind) => string;
  /** Place a 3D model asset into the scene as a new entity (mesh kind 'model'). */
  addModelEntity: (assetId: string) => string;
  /** Add a sculptable terrain entity (mesh kind 'terrain'). */
  addTerrain: () => string;
  /** Patch a terrain entity's config (size/subdivisions/maxHeight/heights). */
  updateTerrain: (id: string, patch: Partial<TerrainConfig>) => void;
  /** Add a baked custom mesh (e.g. a CSG boolean result) as a new entity. */
  addCustomMesh: (geo: CustomGeometry, name?: string) => string;
  /** Create a trigger volume (a sensor-flagged mesh of `kind`). */
  addVolume: (kind: PrimitiveKind) => string;
  setTrigger: (id: string, patch: Partial<NonNullable<Entity['trigger']>>) => void;
  /** Patch a volume's boundary/preset config (seeds defaults if absent). */
  updateVolume: (id: string, patch: Partial<VolumeConfig>) => void;
  /** Add a ready-to-play player: an entity with default movement controls attached. */
  addPlayer: () => string;
  addLight: (kind: LightKind) => string;
  /** Add a Spawner: an editor-only spawn point with no target yet. Returns its entity id. */
  addSpawner: () => string;
  /** Set a spawner's target object and snap that object onto the spawner (its spawn location).
   *  Pass null to clear the target. No-op if `id` isn't a spawner or `targetId` is the spawner. */
  setSpawnerTarget: (id: string, targetId: string | null) => void;
  removeEntity: (id: string) => void;
  duplicateEntity: (id: string) => void;
  renameEntity: (id: string, name: string) => void;
  /** Set an entity's group tag (used by trigger filters / world queries). */
  setEntityTag: (id: string, tag: string) => void;
  updateTransform: (id: string, patch: Partial<Entity['transform']>) => void;
  updateMesh: (id: string, patch: Partial<NonNullable<Entity['mesh']>>) => void;
  /** Patch the selected mesh's PBR/standard material (seeds defaults if absent). */
  updateMaterial: (id: string, patch: Partial<MaterialConfig>) => void;
  updateLight: (id: string, patch: Partial<NonNullable<Entity['light']>>) => void;
  setPhysics: (id: string, patch: Partial<NonNullable<Entity['physics']>>) => void;

  // effect ops
  setActiveEffect: (sel: { entityId: string; effectId: string } | null) => void;
  addEffect: (entityId: string, presetId: string) => string;
  updateEffect: (entityId: string, effectId: string, patch: Partial<EffectConfig>) => void;
  renameEffect: (entityId: string, effectId: string, name: string) => void;
  removeEffect: (entityId: string, effectId: string) => void;
  toggleEffectEnabled: (entityId: string, effectId: string) => void;
  setProp: (id: string, key: string, value: number | string | boolean) => void;

  // script ops
  addScript: (entityId: string) => string;
  detachScript: (entityId: string, scriptId: string) => void;
  setScriptMode: (scriptId: string, mode: ScriptMode) => void;
  updateScriptCode: (scriptId: string, code: string) => void;
  updateScriptGraph: (scriptId: string, graph: ScriptGraph) => void;
  regenerateFromGraph: (scriptId: string) => void;
  toggleScriptEnabled: (scriptId: string) => void;

  // play control
  play: () => void;
  pause: () => void;
  stop: () => void;
  toggleInspector3D: () => void;
  setShowShortcuts: (v: boolean) => void;
  setShowDesign: (v: boolean) => void;
  setRunTour: (v: boolean) => void;

  // game design (goals / objectives / rules)
  updateDesign: (patch: Partial<GameDesign>) => void;
  addObjective: () => string;
  updateObjective: (id: string, patch: Partial<Objective>) => void;
  removeObjective: (id: string) => void;
  /** Patch the scene-wide high-quality rendering settings (3D pipeline/shadows/IBL).
   *  A manual patch clears the active look-preset id (the look is now "Custom"). */
  updateRenderSettings: (patch: Partial<RenderSettings>) => void;
  /** Apply a built-in look preset (Hyperreal Dreamscape etc.): merges the preset's
   *  render settings over the current ones and records it as the active look. */
  applyLookPreset: (id: string) => void;

  /** Patch the selection-highlight prefs (inner glow, colors, blur) and persist to localStorage. */
  updateSelectionPrefs: (patch: Partial<SelectionPrefs>) => void;
  /** Patch the editor-grid prefs (extent, cell size, color, opacity) and persist to localStorage. */
  updateGridPrefs: (patch: Partial<GridPrefs>) => void;
  /** Restore all editor preferences to their built-in defaults. */
  resetEditorPrefs: () => void;
  /** Replace editor prefs from a project's saved settings (DB hydration on open). */
  hydrateEditorPrefs: (prefs: EditorPrefs) => void;

  // HUD editor (lives in design.hud, shared across scenes & game modes)
  setShowHud: (v: boolean) => void;
  selectHudWidget: (id: string | null) => void;
  addHudWidget: (kind: HudWidgetKind) => string;
  updateHudWidget: (id: string, patch: Partial<HudWidget>) => void;
  removeHudWidget: (id: string) => void;
  duplicateHudWidget: (id: string) => void;
  /** Move a widget in the draw order (z-order): 'front' draws last/on-top, 'back' first. */
  reorderHudWidget: (id: string, place: 'front' | 'back') => void;

  // asset library (3D models / textures)
  loadAssetManifest: () => Promise<void>;
  uploadAssets: (files: File[]) => Promise<Asset[]>;
  addAsset: (asset: Asset) => void;
  /** Merge project-persisted generated assets (Modeling-Studio objects) into the library on
   *  open (by id). Not recorded as an undoable edit. */
  hydrateGeneratedAssets: (assets: Asset[]) => void;
  /** Re-sync every linked (proxy) instance from its source asset (call on load, after the scene
   *  + generated assets are hydrated). Not an undoable edit. */
  resolveLinkedAssets: () => void;
  updateAsset: (id: string, patch: Partial<Asset>) => void;
  removeAsset: (id: string) => void;
  /** Delete a library asset (removes it from the library; uploaded assets are also
   *  deleted on the server). No-op for synthetic, model-derived texture entries. */
  deleteAsset: (id: string) => void;
  /** Stash a copy of an asset on the asset clipboard. */
  copyAsset: (id: string) => void;
  /** Paste the clipboard asset as a new library entry; returns its new id (or null). */
  pasteAsset: () => string | null;
  /** Copy + paste in one step: clone a library asset under a new id. */
  duplicateAsset: (id: string) => string | null;
  selectAsset: (id: string | null) => void;
  setShowAssetBrowser: (v: boolean) => void;
  setShowAssetViewer: (v: boolean) => void;

  // prefabs (reusable entity templates, game-level)
  /** Capture an entity (+ its behaviours) as a named prefab; returns the prefab id. */
  savePrefab: (entityId: string, name: string) => string;
  /** Stamp a fresh instance of a prefab into the scene; returns the new entity id. */
  instantiatePrefab: (prefabId: string) => string;
  removePrefab: (prefabId: string) => void;
  hydratePrefabs: (prefabs: Record<string, PrefabDef>) => void;

  // material presets (reusable named materials, game-level)
  /** Save a material as a named, reusable preset; returns its id (reuses by name). */
  saveMaterialPreset: (name: string, material: MaterialConfig) => string;
  /** Replace an entity's mesh material with a preset's (a fresh clone). */
  applyMaterialPreset: (entityId: string, presetId: string) => void;
  removeMaterialPreset: (presetId: string) => void;
  hydrateMaterialPresets: (presets: Record<string, MaterialPreset>) => void;

  // persistence (load a scene/scripts from the backend, or seed a new game)
  hydrateScene: (data: { entities: Entity[]; gameCamera?: { position: Vec3; rotation: Vec3 }; gridVisible?: boolean }) => void;
  hydrateDesign: (design: GameDesign) => void;
  hydrateScripts: (scripts: Record<string, Script>) => void;
  loadStarterScene: () => void;

  // workspace layout (dockable panels + presets)
  /** Persist the live dock arrangement (called on dock layout changes, throttled). */
  setWorkspaceLayout: (layout: SerializedDockview) => void;
  /** Mark which preset is active (built-in id or custom id) for menu highlighting. */
  setActivePreset: (id: string) => void;
  /** Save the current arrangement as a named custom layout; returns its id. */
  saveCustomLayout: (label: string, layout: SerializedDockview) => string;
  /** Delete a saved custom layout. */
  deleteCustomLayout: (id: string) => void;
  /** Load a workspace blob from the backend (or reset to defaults if absent). */
  hydrateWorkspace: (workspace: Workspace) => void;
}

/** Zustand setter/getter handed to each slice factory. */
export type StoreSet = StoreApi<EditorState>['setState'];
export type StoreGet = StoreApi<EditorState>['getState'];
