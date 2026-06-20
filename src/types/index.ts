import type { Edge, Node } from '@xyflow/react';
import type { MaterialConfig, RenderSettings, StudioEnv } from './visuals';
import { defaultRenderSettings, defaultStudioEnv } from './visuals';
import type { VolumeConfig } from './volume';
import type { SkinData, RigComponent } from './studio';

// Visual/material/render types live in ./visuals; volume types in ./volume —
// re-export both so `@/types` stays the single import surface.
export * from './visuals';
export * from './volume';

/** A 3-component vector used for transforms. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type PrimitiveKind =
  // 3D solids
  | 'box' | 'sphere' | 'ground' | 'cylinder' | 'cone' | 'torus' | 'plane' | 'empty'
  // 2D shapes (flat, in the XY plane)
  | 'square' | 'circle' | 'triangle';

/** Whether a game is authored in 3D or 2D. Drives camera/render/tooling setup. */
export type GameMode = '2d' | '3d';

/** Primitives offered by the toolbar/menus, per game mode. */
export const PRIMS_3D: PrimitiveKind[] = ['box', 'sphere', 'cylinder', 'cone', 'torus', 'plane', 'ground', 'empty'];
export const PRIMS_2D: PrimitiveKind[] = ['square', 'circle', 'triangle', 'plane', 'empty'];
export const primsFor = (mode: GameMode): PrimitiveKind[] => (mode === '2d' ? PRIMS_2D : PRIMS_3D);

/** Shapes offered for trigger volumes (sensor zones), per game mode. */
export const VOLUME_SHAPES_3D: PrimitiveKind[] = ['box', 'sphere', 'cylinder'];
export const VOLUME_SHAPES_2D: PrimitiveKind[] = ['square', 'circle'];
export const volumesFor = (mode: GameMode): PrimitiveKind[] => (mode === '2d' ? VOLUME_SHAPES_2D : VOLUME_SHAPES_3D);

export type LightKind = 'hemispheric' | 'point' | 'directional';

/** How an entity's behaviour is authored. A script can be flipped between modes at any time. */
export type ScriptMode = 'nodes' | 'code';

export interface ScriptGraph {
  nodes: Node[];
  edges: Edge[];
}

/** A behaviour attached to an entity. Holds both a node graph and code; `mode` says which is the source of truth. */
export interface Script {
  id: string;
  name: string;
  mode: ScriptMode;
  /** Hand-written code. When mode === 'nodes' this is the generated output (read-only-ish). */
  code: string;
  /** Node graph authored in React Flow. */
  graph: ScriptGraph;
  /** Set true after generated code has been hand-edited, so we don't silently overwrite. */
  codeDirty?: boolean;
  enabled: boolean;
}

/** Mesh source: a built-in primitive, an external 3D model, a sculptable terrain,
 *  or a baked custom mesh (e.g. the result of a CSG boolean operation). */
export type MeshKind = PrimitiveKind | 'model' | 'terrain' | 'custom';

/** Boolean operation used to combine two meshes into a custom mesh. */
export type BooleanOp = 'union' | 'subtract' | 'intersect';

/** Baked, serializable geometry for a `kind: 'custom'` mesh (CSG result / sculpt /
 *  modeled mesh). `positions`/`indices`/`normals` are the triangulated render arrays
 *  (Babylon's VertexData layout). The optional `polyVerts`/`polygons` preserve the
 *  editable **polygon** topology (quads/n-gons) so meshes round-trip as quads instead
 *  of triangle soup when re-opened in the Modeling Studio. */
export interface CustomGeometry {
  positions: number[];
  indices: number[];
  normals: number[];
  uvs?: number[];
  /** Welded vertex positions (xyz triples) for the polygon representation. */
  polyVerts?: number[];
  /** Face loops (vertex indices into `polyVerts`) — quads/n-gons, not triangles. */
  polygons?: number[][];
}

/**
 * A sculptable ground plane. `heights` is a row-major (subdivisions+1)² array of
 * normalized [0,1] elevations, scaled by `maxHeight` at build time, so changing
 * `maxHeight` rescales existing sculpts. Persisted inline with the entity.
 */
export interface TerrainConfig {
  /** World-unit width/depth of the (square) terrain. */
  size: number;
  /** Grid resolution; vertices per side = subdivisions + 1. */
  subdivisions: number;
  /** World-unit height applied to a normalized elevation of 1. */
  maxHeight: number;
  /** Normalized heightfield (row-major, length (subdivisions+1)²). Empty = flat. */
  heights: number[];
}

/** A flat default terrain: a 40×40 plane at a workable sculpting resolution. */
export function defaultTerrain(): TerrainConfig {
  return { size: 40, subdivisions: 64, maxHeight: 8, heights: [] };
}

/** Terrain sculpt brush operation. */
export type BrushMode = 'raise' | 'lower' | 'smooth' | 'flatten';

/** Terrain sculpt brush settings (shared by the UI and the sculpt controller). */
export interface BrushParams {
  /** Brush radius in world units. */
  radius: number;
  /** Per-application strength. */
  strength: number;
  mode: BrushMode;
}

export function defaultBrush(): BrushParams {
  return { radius: 4, strength: 0.05, mode: 'raise' };
}

// Modeling Studio types (sculpt brushes, rigs, skeletal animation) live in ./studio.
export * from './studio';

export interface MeshConfig {
  kind: MeshKind;
  /** When kind === 'model', the id of the Asset (see AssetLibrary) to load. */
  assetId?: string;
  /** hex color, e.g. #44aaff */
  color: string;
  /** Optional PBR/standard surface material (primitives). Absent = flat `color`. */
  material?: MaterialConfig;
  /** Sculptable terrain config — present only when `kind === 'terrain'`. */
  terrain?: TerrainConfig;
  /** Baked geometry — present only when `kind === 'custom'` (CSG result). */
  custom?: CustomGeometry;
  /** Skin weights binding this mesh to its entity's rig skeleton (see `Entity.rig`). */
  skin?: SkinData;
  /** Whether the surface is rendered. Independent of `collision`: a hidden mesh
   *  can still be collidable, so it can be toggled invisible at runtime while
   *  still interacting with the world. */
  visible: boolean;
  /** Whether the mesh is collidable/detectable by the world — physics colliders
   *  and trigger-volume overlap. Absent/undefined counts as collidable (the
   *  default), so existing scenes and newly-created meshes collide as before. */
  collision?: boolean;
  /** Modeling Studio: maps a focused object's island key (rounded centroid) → the library
   *  asset id it was exported to via the "Make asset" toggle. Drives the toggle's state. */
  objectAssets?: Record<string, string>;
  /** When set, this mesh is a *linked* instance (proxy) of the given generated asset: on every
   *  project load its geometry/material/colour are re-synced from that asset, so edits to the
   *  source object propagate. Absent = an independent copy. Set when importing a `reference` asset. */
  linkedAssetId?: string;
}

/** True when a mesh participates in world collision (physics + triggers). No mesh
 *  means nothing to collide with; a present mesh is collidable unless `collision`
 *  is explicitly false (absent/undefined counts as collidable for back-compat). */
export const isMeshCollidable = (mesh?: Pick<MeshConfig, 'collision'>): boolean =>
  !!mesh && mesh.collision !== false;

export interface LightConfig {
  kind: LightKind;
  color: string;
  intensity: number;
}

/** Motion type of a physics body. `static` never moves; `dynamic` is fully simulated. */
export type PhysicsBodyType = 'dynamic' | 'static' | 'kinematic';

/** Collider shape used to build the physics body. `auto` picks one from the mesh kind. */
export type PhysicsShape = 'auto' | 'box' | 'sphere' | 'capsule' | 'cylinder';

/** Optional rigid-body component (Havok) attached to an entity. */
export interface PhysicsConfig {
  enabled: boolean;
  type: PhysicsBodyType;
  /** kg — ignored for static bodies. */
  mass: number;
  /** Bounciness 0–1. */
  restitution: number;
  /** Surface friction 0–1. */
  friction: number;
  shape: PhysicsShape;
}

/**
 * High-level physics presets surfaced in the Inspector:
 * - `none`  — no physics body.
 * - `solid` — a static collider: blocks the player and never moves (walls, platforms).
 * - `rigid` — a simulated body that falls and reacts (dynamic or kinematic).
 */
export type PhysicsMode = 'none' | 'solid' | 'rigid';

/** Derive the high-level physics mode from a (possibly absent) physics component. */
export const physicsModeOf = (p?: Pick<PhysicsConfig, 'enabled' | 'type'>): PhysicsMode =>
  !p?.enabled ? 'none' : p.type === 'static' ? 'solid' : 'rigid';

/** Marks an entity's mesh as a sensor "volume" that fires enter/exit/stay events. */
export interface TriggerConfig {
  enabled: boolean;
  /** Fire the enter event at most once (then the volume goes dormant). */
  once: boolean;
  /** Names or tags that count as triggering this volume. Empty = any mesh object. */
  filter: string[];
  /** Optional movement boundary + preset behaviour (dead zone / fog / water / sound). */
  volume?: VolumeConfig;
}

/**
 * Marks an entity as a Spawner: an editor-only reference point that spawns copies of a chosen
 * target object into the running game when triggered (via the spawn action). The spawner has no
 * game mesh of its own — only a camera-facing billboard drawn in the scene editor. At play start
 * the target is hidden into the spawner's pool; `world.spawn` deploys instances at this location
 * and `world.despawn` returns them for reuse (see {@link SpawnPool}). Counts are unbounded, so it
 * doubles as the entry point for AI-driven spawning later.
 */
export interface SpawnerConfig {
  /** Entity id of the object this spawner deploys (its template/source). null until chosen. */
  targetId: string | null;
  /** How many instances to pre-create in the pool at play start (0 = grow lazily on first spawn). */
  prewarm?: number;
}

/** Whether an entity is a Spawner (has a spawner component). */
export const isSpawner = (e: Pick<Entity, 'spawner'>): boolean => !!e.spawner;

// ---------------- Effects (particle VFX) ----------------

/** Emitter volume a particle system spawns from. */
export type EmitterShape = 'point' | 'box' | 'sphere' | 'cone';

/** How particles composite. ADD/ONEONE glow (fire/magic); STANDARD is alpha-blended (smoke). */
export type BlendMode = 'STANDARD' | 'ADD' | 'ONEONE' | 'MULTIPLY';

/** Built-in procedural particle sprite (drawn at runtime — no image assets). */
export type ParticleTextureKind = 'soft' | 'spark' | 'smoke' | 'star' | 'circle';

/** RGBA in 0–1. */
export type RGBA = [number, number, number, number];

/** A single stop on a color-over-life gradient. */
export interface ColorStop {
  at: number; // 0–1 along particle life
  color: RGBA;
}
/** A single stop on a numeric-over-life gradient (size/velocity/etc.). */
export interface FactorStop {
  at: number;
  value: number;
}

export interface EffectPlayback {
  /** `auto` starts at Play; `manual` only starts when triggered (node/script/collision). */
  mode: 'auto' | 'manual';
  /** Emit forever until stopped. */
  loop: boolean;
  /** One-shot/timed length in seconds (used when not looping; 0 = instantaneous burst). */
  duration: number;
  /** Delay before emission starts, seconds. */
  delay: number;
}

/** A serializable particle-effect description that maps onto a Babylon particle system. */
export interface EffectConfig {
  emitter: {
    shape: EmitterShape;
    radius: number;
    angle: number; // cone half-angle (radians)
    boxMin: Vec3;
    boxMax: Vec3;
    direction1: Vec3;
    direction2: Vec3;
  };
  capacity: number;
  emitRate: number;
  minSize: number;
  maxSize: number;
  minLifeTime: number;
  maxLifeTime: number;
  minEmitPower: number;
  maxEmitPower: number;
  gravity: Vec3;
  color1: RGBA;
  color2: RGBA;
  colorDead: RGBA;
  /** Optional color-over-life gradient (overrides color1/2 when present). */
  colorGradients?: ColorStop[];
  /** Optional size-over-life gradient. */
  sizeGradients?: FactorStop[];
  blendMode: BlendMode;
  billboard: boolean;
  texture: ParticleTextureKind;
  useGPU: boolean;
  playback: EffectPlayback;
}

/** A particle effect attached to an entity. Stored inline so it persists with the scene. */
export interface EffectInstance {
  id: string;
  name: string;
  enabled: boolean;
  /** Preset id this was created from (for reference/relabel). */
  preset?: string;
  config: EffectConfig;
}

export interface Entity {
  id: string;
  name: string;
  parentId: string | null;
  transform: {
    position: Vec3;
    rotation: Vec3; // euler degrees
    scale: Vec3;
  };
  mesh?: MeshConfig;
  light?: LightConfig;
  /** Optional rigid-body physics. Absent = no physics body. */
  physics?: PhysicsConfig;
  /** Marks this entity's mesh as a trigger volume (sensor zone). */
  trigger?: TriggerConfig;
  /** Marks this entity as a Spawner (editor-only spawn point; see {@link SpawnerConfig}). */
  spawner?: SpawnerConfig;
  /** Optional group label, used by trigger filters and world queries. */
  tag?: string;
  /** Particle effects attached to this entity (VFX). */
  effects?: EffectInstance[];
  /** Optional armature: skeleton, current pose, and keyframe clips (see Modeling Studio). */
  rig?: RigComponent;
  /** IDs of scripts (behaviours) attached to this entity. */
  scriptIds: string[];
  /** Arbitrary user data exposed to scripts via entity.props. */
  props: Record<string, number | string | boolean>;
}

/**
 * A single trackable goal. `flag` objectives are simply done/not-done; `counter`
 * objectives accumulate progress toward `target` (e.g. "collect 5 coins"). Scripts
 * complete them or add progress through the `world` API / objective nodes.
 */
export interface Objective {
  id: string;
  title: string;
  description: string;
  /** Importance — drives win logic (all `primary` objectives done = game won). */
  priority: 'primary' | 'secondary' | 'bonus';
  metric: 'flag' | 'counter';
  /** Counter goal target (ignored for `flag`). */
  target: number;
  /** Optional reward/outcome note shown to the designer. */
  reward: string;
}

/**
 * On-screen HUD. Shared by 2D and 3D games — a screen-space overlay drawn on top
 * of whatever camera renders. Widgets are positioned/sized as percentages of the
 * view, so one layout scales to any preview or play resolution.
 */
export type HudWidgetKind =
  | 'text'
  | 'score'
  | 'timer'
  | 'healthbar'
  | 'bar'
  | 'ammo'
  | 'crosshair'
  | 'panel'
  | 'button'
  | 'icon'
  | 'objective';

export interface HudWidget {
  id: string;
  kind: HudWidgetKind;
  name: string;
  /** Top-left position as a percent of the view (x of width, y of height). */
  x: number;
  y: number;
  /** Size as a percent of the view (w of width, h of height). */
  w: number;
  h: number;
  /** Text / label content (or glyph for `icon`). */
  label: string;
  /** Foreground / text / bar-fill color (hex). */
  color: string;
  /** Background / panel / bar-track color (hex). */
  bg: string;
  /** Font size in px at a 720p reference height; scaled to the live view. */
  fontSize: number;
  /** Corner rounding in px (at 720p reference). */
  radius: number;
  /** 0–1 overall opacity. */
  opacity: number;
  align: 'left' | 'center' | 'right';
  /** Live binding: read `bindProp` from object `bindTarget` (name/id; '' = first Player). */
  bindTarget: string;
  bindProp: string;
  /** Static value shown in the editor and used as a fallback (score/timer/bars). */
  value: number;
  /** Max value for bars. */
  max: number;
  visible: boolean;
}

export interface HudLayout {
  widgets: HudWidget[];
}

export function emptyHud(): HudLayout {
  return { widgets: [] };
}

/**
 * Game-wide design document: the goals, rules and win/lose conditions that make a
 * scene a *game*. Stored per game (in `games.settings.design`), shared across
 * scenes, and surfaced to scripts so objects can act in line with the goals.
 */
export interface GameDesign {
  /** One-line concept / elevator pitch. */
  pitch: string;
  /** How the player wins (prose; objectives make it mechanical). */
  winCondition: string;
  /** How the player loses. */
  loseCondition: string;
  /** Free-form rules / constraints of the game. */
  rules: string[];
  objectives: Objective[];
  /** On-screen HUD layout (shared across scenes). */
  hud: HudLayout;
  /** High-quality rendering / lighting config (3D). */
  render: RenderSettings;
  /** Modeling Studio viewport preview (env/IBL, lights, tone, lit PBR). Studio-only; persisted
   *  so the Studio reopens as it was left. */
  studioEnv: StudioEnv;
}

/**
 * A reusable, named entity template — captured from a scene entity (its full
 * config + attached behaviours) and stamped back into any scene as a fresh
 * instance. Stored per game (in `games.settings.prefabs`), shared across scenes.
 */
export interface PrefabDef {
  id: string;
  name: string;
  /** The captured entity (its `id` is ignored — a new one is minted on instantiate). */
  entity: Entity;
  /** The entity's behaviours, cloned with new ids on instantiate. */
  scripts: Script[];
}

export function emptyDesign(): GameDesign {
  return { pitch: '', winCondition: '', loseCondition: '', rules: [], objectives: [], hud: emptyHud(), render: defaultRenderSettings(), studioEnv: defaultStudioEnv() };
}

// Asset library types (3D models & textures) live in ./assets.
export * from './assets';

export type PlayState = 'editing' | 'playing' | 'paused';

/** Whether the user may edit the scene (move/adjust objects) in this play state.
 *  Editable while 'editing' and while 'paused' (adjust the frozen game); locked
 *  while 'playing' so the runtime keeps authority over object transforms. */
export const isSceneEditable = (playState: PlayState): boolean => playState !== 'playing';

/** Which transform gizmo is active in the viewport. */
export type GizmoMode = 'select' | 'move' | 'rotate' | 'scale';

/** A copied entity (with its behaviours) held on the editor clipboard. */
export interface Clipboard {
  entity: Entity;
  scripts: Script[];
}

export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

export interface LogEntry {
  id: string;
  level: LogLevel;
  /** Pre-formatted message string. */
  message: string;
  /** Source label, e.g. script name or "runtime". */
  source: string;
  time: number;
  count: number;
}
