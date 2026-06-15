import type { Edge, Node } from '@xyflow/react';

/** A 3-component vector used for transforms. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type PrimitiveKind =
  // 3D solids
  | 'box' | 'sphere' | 'ground' | 'cylinder' | 'cone' | 'plane' | 'empty'
  // 2D shapes (flat, in the XY plane)
  | 'square' | 'circle' | 'triangle';

/** Whether a game is authored in 3D or 2D. Drives camera/render/tooling setup. */
export type GameMode = '2d' | '3d';

/** Primitives offered by the toolbar/menus, per game mode. */
export const PRIMS_3D: PrimitiveKind[] = ['box', 'sphere', 'cylinder', 'cone', 'plane', 'ground', 'empty'];
export const PRIMS_2D: PrimitiveKind[] = ['square', 'circle', 'triangle', 'plane', 'empty'];
export const primsFor = (mode: GameMode): PrimitiveKind[] => (mode === '2d' ? PRIMS_2D : PRIMS_3D);

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

export interface MeshConfig {
  kind: PrimitiveKind;
  /** hex color, e.g. #44aaff */
  color: string;
  visible: boolean;
}

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

/** Marks an entity's mesh as a sensor "volume" that fires enter/exit/stay events. */
export interface TriggerConfig {
  enabled: boolean;
  /** Fire the enter event at most once (then the volume goes dormant). */
  once: boolean;
  /** Names or tags that count as triggering this volume. Empty = any mesh object. */
  filter: string[];
}

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
  /** Optional group label, used by trigger filters and world queries. */
  tag?: string;
  /** Particle effects attached to this entity (VFX). */
  effects?: EffectInstance[];
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
}

export function emptyDesign(): GameDesign {
  return { pitch: '', winCondition: '', loseCondition: '', rules: [], objectives: [], hud: emptyHud() };
}

export type PlayState = 'editing' | 'playing' | 'paused';

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
