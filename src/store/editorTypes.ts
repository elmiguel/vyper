import type { StoreApi } from 'zustand';
import type {
  Clipboard,
  EffectConfig,
  Entity,
  GameDesign,
  GameMode,
  GizmoMode,
  HudWidget,
  HudWidgetKind,
  LightKind,
  Objective,
  PlayState,
  PrimitiveKind,
  Script,
  ScriptGraph,
  ScriptMode,
  Vec3,
} from '@/types';
import { type KeymapId } from '@/input/keymaps';

/** Undo history is snapshot-based: each entry captures the editable scene state. */
export interface Snapshot {
  entities: Entity[];
  scripts: Record<string, Script>;
  selectedId: string | null;
}

export interface EditorState {
  /** 3D or 2D authoring — set when a game opens; drives camera/render/tooling. */
  mode: GameMode;
  entities: Entity[];
  scripts: Record<string, Script>;
  selectedId: string | null;
  /** Selected script tab in the script/node editor. */
  activeScriptId: string | null;
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
  /** Bumped to ask the viewport to frame the selected object. */
  focusRequest: number;
  /** Active transform gizmo. */
  gizmoMode: GizmoMode;
  /** Active keyboard shortcut layout. */
  keymap: KeymapId;
  /** Game-play camera transform — editable, shown as a helper in the editor view. */
  gameCamera: { position: Vec3; rotation: Vec3 };
  /** Bumped when the game camera moves, so the viewport re-applies it (cheap, no rebuild). */
  cameraRevision: number;
  /** Whether the editor grid is visible (editor-only; never in the game view). */
  gridVisible: boolean;
  clipboard: Clipboard | null;
  past: Snapshot[];
  future: Snapshot[];

  // selection
  select: (id: string | null) => void;
  setActiveScript: (id: string | null) => void;

  // editor mode / shortcuts
  setMode: (mode: GameMode) => void;
  setGizmoMode: (mode: GizmoMode) => void;
  setKeymap: (id: KeymapId) => void;
  focusSelected: () => void;

  // editor objects
  updateGameCamera: (patch: Partial<{ position: Vec3; rotation: Vec3 }>) => void;
  resetGameCamera: () => void;
  toggleGrid: () => void;

  // history & clipboard
  record: (label: string) => void;
  undo: () => void;
  redo: () => void;
  copySelected: () => void;
  paste: () => void;

  // entity ops
  addPrimitive: (kind: PrimitiveKind) => string;
  /** Create a trigger volume (a sensor-flagged mesh of `kind`). */
  addVolume: (kind: PrimitiveKind) => string;
  setTrigger: (id: string, patch: Partial<NonNullable<Entity['trigger']>>) => void;
  /** Add a ready-to-play player: an entity with default movement controls attached. */
  addPlayer: () => string;
  addLight: (kind: LightKind) => string;
  removeEntity: (id: string) => void;
  duplicateEntity: (id: string) => void;
  renameEntity: (id: string, name: string) => void;
  /** Set an entity's group tag (used by trigger filters / world queries). */
  setEntityTag: (id: string, tag: string) => void;
  updateTransform: (id: string, patch: Partial<Entity['transform']>) => void;
  updateMesh: (id: string, patch: Partial<NonNullable<Entity['mesh']>>) => void;
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

  // HUD editor (lives in design.hud, shared across scenes & game modes)
  setShowHud: (v: boolean) => void;
  selectHudWidget: (id: string | null) => void;
  addHudWidget: (kind: HudWidgetKind) => string;
  updateHudWidget: (id: string, patch: Partial<HudWidget>) => void;
  removeHudWidget: (id: string) => void;
  duplicateHudWidget: (id: string) => void;
  /** Move a widget in the draw order (z-order): 'front' draws last/on-top, 'back' first. */
  reorderHudWidget: (id: string, place: 'front' | 'back') => void;

  // persistence (load a scene/scripts from the backend, or seed a new game)
  hydrateScene: (data: { entities: Entity[]; gameCamera?: { position: Vec3; rotation: Vec3 }; gridVisible?: boolean }) => void;
  hydrateDesign: (design: GameDesign) => void;
  hydrateScripts: (scripts: Record<string, Script>) => void;
  loadStarterScene: () => void;
}

/** Zustand setter/getter handed to each slice factory. */
export type StoreSet = StoreApi<EditorState>['setState'];
export type StoreGet = StoreApi<EditorState>['getState'];
