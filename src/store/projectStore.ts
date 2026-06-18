import { create } from 'zustand';
import { nanoid } from 'nanoid';
import { api, type GameSummary, type SceneMeta, type ScriptRow, type VersionMeta } from '@/data';
import { useEditorStore, starterEntities } from './editorStore';
import { applyAutoCover, captureViewportCover, resetAutoCover } from './projectCover';
import type { Entity, GameDesign, GameMode, MaterialPreset, PrefabDef, Script } from '@/types';
import { emptyDesign } from '@/types';

/** A fresh modeling project starts from one editable box at the origin. */
function modelStarterEntities(): Entity[] {
  return [
    {
      id: nanoid(8),
      name: 'Mesh',
      parentId: null,
      transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
      mesh: { kind: 'box', color: '#9aa3b2', visible: true },
      scriptIds: [],
      props: {},
    },
  ];
}
import type { Workspace } from './editorTypes';
import { defaultWorkspace } from './slices/workspaceSlice';

/** Read the 2D/3D kind off a game's settings blob (defaults to 3D). */
export function gameModeOf(settings: Record<string, unknown> | undefined): GameMode {
  return settings?.kind === '2d' ? '2d' : '3d';
}

/** Read the game design doc off a game's settings blob (defaults to empty). The
 *  nested `render` block is deep-merged over defaults so games saved before newer
 *  render fields (e.g. shadow controls) existed still hydrate a complete object. */
export function designOf(settings: Record<string, unknown> | undefined): GameDesign {
  const base = emptyDesign();
  const d = settings?.design as Partial<GameDesign> | undefined;
  if (!d) return base;
  return { ...base, ...d, render: { ...base.render, ...(d.render ?? {}) } };
}

/** Read the prefab library off a game's settings blob (defaults to empty). */
export function prefabsOf(settings: Record<string, unknown> | undefined): Record<string, PrefabDef> {
  return (settings?.prefabs as Record<string, PrefabDef> | undefined) ?? {};
}

/** Read the saved material presets off a game's settings blob (defaults to empty). */
export function materialsOf(settings: Record<string, unknown> | undefined): Record<string, MaterialPreset> {
  return (settings?.materials as Record<string, MaterialPreset> | undefined) ?? {};
}

/** Read the dockable-workspace layout off a game's settings blob (defaults to fresh). */
export function workspaceOf(settings: Record<string, unknown> | undefined): Workspace {
  const w = settings?.workspace as Partial<Workspace> | undefined;
  return { ...defaultWorkspace(), ...(w ?? {}) };
}

type View = 'home' | 'loading' | 'editor' | 'modeler';
type SnapshotKind = 'auto' | 'manual' | false;

/** True when a game's settings mark it as a 3D-modeling project (not a playable game). */
export function isModelProject(settings: Record<string, unknown> | undefined): boolean {
  return settings?.kind === 'model';
}

const AUTOSAVE_DEBOUNCE = 3500; // ms of inactivity before autosaving
const AUTO_SNAPSHOT_INTERVAL = 120_000; // min ms between auto revert-snapshots

function rowsToScripts(rows: ScriptRow[]): Record<string, Script> {
  const out: Record<string, Script> = {};
  for (const r of rows) {
    out[r.id] = {
      id: r.id,
      name: r.name,
      mode: r.mode,
      code: r.code,
      codeDirty: r.codeDirty,
      enabled: r.enabled,
      graph: { nodes: (r.graph?.nodes as never) ?? [], edges: (r.graph?.edges as never) ?? [] },
    };
  }
  return out;
}

function currentScriptsArray() {
  return Object.values(useEditorStore.getState().scripts);
}

interface ProjectState {
  view: View;
  games: GameSummary[];
  gamesLoading: boolean;
  error: string | null;

  gameId: string | null;
  gameName: string;
  /** Last-known game settings blob (kind, design, …) — merged on save. */
  gameSettings: Record<string, unknown>;
  scenes: SceneMeta[];
  sceneId: string | null;
  saving: boolean;
  lastSavedAt: number | null;
  dirty: boolean;
  autosaveEnabled: boolean;
  lastSnapshotAt: number | null;

  // revert history
  versions: VersionMeta[];
  versionsLoading: boolean;
  showHistory: boolean;

  refreshGames: () => Promise<void>;
  newGame: (name: string, mode?: GameMode) => Promise<void>;
  /** Create a 3D-modeling project (persisted like a game, opened in the Modeler area). */
  newModel: (name: string) => Promise<void>;
  openGame: (id: string) => Promise<void>;
  deleteGame: (id: string) => Promise<void>;
  /** Set (or clear, with null) a project's cover image, persisted in its settings. */
  setGameCover: (id: string, dataUrl: string | null) => Promise<void>;
  /** Capture the current editor viewport and set it as the open project's cover.
   *  Resolves true on success, false if the viewport couldn't be captured. */
  captureCover: () => Promise<boolean>;
  renameGame: (name: string) => Promise<void>;
  save: (opts?: { snapshot?: SnapshotKind; label?: string }) => Promise<void>;
  setAutosave: (v: boolean) => void;
  loadVersions: () => Promise<void>;
  restoreVersion: (id: string) => Promise<void>;
  setShowHistory: (v: boolean) => void;
  switchScene: (sceneId: string) => Promise<void>;
  addScene: (name?: string) => Promise<void>;
  renameScene: (id: string, name: string) => Promise<void>;
  deleteScene: (id: string) => Promise<void>;
  goHome: () => Promise<void>;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  view: 'home',
  games: [],
  gamesLoading: false,
  error: null,
  gameId: null,
  gameName: '',
  gameSettings: {},
  scenes: [],
  sceneId: null,
  saving: false,
  lastSavedAt: null,
  dirty: false,
  autosaveEnabled: true,
  lastSnapshotAt: null,
  versions: [],
  versionsLoading: false,
  showHistory: false,

  refreshGames: async () => {
    set({ gamesLoading: true, error: null });
    try {
      set({ games: await api.listGames(), gamesLoading: false });
    } catch (e) {
      set({ error: (e as Error).message, gamesLoading: false });
    }
  },

  newGame: async (name, mode = '3d') => {
    set({ view: 'loading', error: null });
    try {
      // Set the authoring mode first so the starter scene + engine build for 2D/3D.
      useEditorStore.getState().setMode(mode);
      const detail = await api.createGame(name.trim() || 'Untitled Game');
      const sceneId = detail.game.activeSceneId ?? detail.scenes[0]?.id ?? null;
      // Persist the kind on the game so it's restored on reopen.
      const settings = { ...(detail.game.settings ?? {}), kind: mode };
      await api.patchGame(detail.game.id, { settings });
      // Seed the editor with starter content, then persist it as this scene.
      useEditorStore.getState().hydrateScripts({});
      useEditorStore.getState().hydrateWorkspace(defaultWorkspace());
      useEditorStore.getState().loadStarterScene();
      set({
        gameId: detail.game.id,
        gameName: detail.game.name,
        gameSettings: settings,
        scenes: detail.scenes,
        sceneId,
        view: 'editor',
        dirty: false,
        lastSnapshotAt: null,
      });
      await get().save({ snapshot: 'manual', label: 'Created' });
      await api.putApp({ lastGameId: detail.game.id });
    } catch (e) {
      set({ error: (e as Error).message, view: 'home' });
    }
  },

  newModel: async (name) => {
    set({ view: 'loading', error: null });
    try {
      useEditorStore.getState().setMode('3d'); // modeling is always 3D
      const detail = await api.createGame(name.trim() || 'Untitled Model');
      const sceneId = detail.game.activeSceneId ?? detail.scenes[0]?.id ?? null;
      const settings = { ...(detail.game.settings ?? {}), kind: 'model' };
      await api.patchGame(detail.game.id, { settings });
      useEditorStore.getState().hydrateScripts({});
      useEditorStore.getState().hydrateWorkspace(defaultWorkspace());
      // Seed a clean single editable box to start sculpting/modeling from.
      useEditorStore.getState().hydrateScene({ entities: modelStarterEntities() });
      set({
        gameId: detail.game.id,
        gameName: detail.game.name,
        gameSettings: settings,
        scenes: detail.scenes,
        sceneId,
        view: 'modeler',
        dirty: false,
        lastSnapshotAt: null,
      });
      await get().save({ snapshot: 'manual', label: 'Created' });
      await api.putApp({ lastGameId: detail.game.id });
    } catch (e) {
      set({ error: (e as Error).message, view: 'home' });
    }
  },

  openGame: async (id) => {
    set({ view: 'loading', error: null });
    try {
      const detail = await api.getGame(id);
      const sceneId = detail.game.activeSceneId ?? detail.scenes[0]?.id;
      if (!sceneId) throw new Error('game has no scenes');
      resetAutoCover(id); // re-evaluate auto-cover for this fresh session
      const model = isModelProject(detail.game.settings);
      // Restore the authoring mode before hydrating so the engine builds for 2D/3D
      // (models are always 3D).
      useEditorStore.getState().setMode(model ? '3d' : gameModeOf(detail.game.settings));
      useEditorStore.getState().hydrateDesign(designOf(detail.game.settings));
      useEditorStore.getState().hydratePrefabs(prefabsOf(detail.game.settings));
      useEditorStore.getState().hydrateMaterialPresets(materialsOf(detail.game.settings));
      useEditorStore.getState().hydrateWorkspace(workspaceOf(detail.game.settings));
      useEditorStore.getState().hydrateScripts(rowsToScripts(detail.scripts));
      const scene = await api.getScene(sceneId);
      useEditorStore.getState().hydrateScene({
        entities: scene.entities,
        gameCamera: scene.gameCamera,
        gridVisible: scene.gridVisible,
      });
      set({
        gameId: detail.game.id,
        gameName: detail.game.name,
        scenes: detail.scenes,
        sceneId,
        gameSettings: detail.game.settings ?? {},
        view: model ? 'modeler' : 'editor',
        dirty: false,
        lastSavedAt: Date.now(),
        lastSnapshotAt: null,
      });
      await api.putApp({ lastGameId: detail.game.id });
    } catch (e) {
      set({ error: (e as Error).message, view: 'home' });
    }
  },

  deleteGame: async (id) => {
    await api.deleteGame(id);
    await get().refreshGames();
  },

  setGameCover: async (id, dataUrl) => {
    const game = get().games.find((g) => g.id === id);
    if (!game) return;
    const settings: Record<string, unknown> = { ...(game.settings ?? {}) };
    if (dataUrl) settings.coverImage = dataUrl;
    else delete settings.coverImage;
    // Optimistic update so the list reflects the change immediately.
    set((s) => ({ games: s.games.map((g) => (g.id === id ? { ...g, settings } : g)) }));
    try {
      await api.patchGame(id, { settings });
    } catch (e) {
      set({ error: (e as Error).message });
      await get().refreshGames();
    }
  },

  captureCover: async () => {
    const { gameId } = get();
    if (!gameId) return false;
    const thumb = captureViewportCover();
    if (!thumb) {
      set({ error: 'Could not capture the viewport for a thumbnail.' });
      return false;
    }
    const settings = { ...get().gameSettings, coverImage: thumb };
    set({ gameSettings: settings });
    try {
      await api.patchGame(gameId, { settings });
      return true;
    } catch (e) {
      set({ error: (e as Error).message });
      return false;
    }
  },

  renameGame: async (name) => {
    const { gameId } = get();
    if (!gameId) return;
    set({ gameName: name });
    await api.patchGame(gameId, { name });
  },

  save: async (opts) => {
    const { gameId, sceneId } = get();
    if (!gameId || !sceneId) return;
    set({ saving: true, error: null });
    try {
      const ed = useEditorStore.getState();
      const scripts = currentScriptsArray();
      await api.patchScene(sceneId, {
        entities: ed.entities,
        gameCamera: ed.gameCamera,
        gridVisible: ed.gridVisible,
      });
      await api.putScripts(gameId, scripts);
      // Game-level settings: persist the design doc alongside the kind, merging
      // over the last-known blob so we never drop other keys.
      // Models keep their 'model' kind; games store their 2D/3D authoring mode.
      const projectKind = isModelProject(get().gameSettings) ? 'model' : ed.mode;
      const settings: Record<string, unknown> = { ...get().gameSettings, kind: projectKind, design: ed.design, prefabs: ed.prefabs, materials: ed.materialPresets, workspace: ed.workspace };
      // Auto-cover: on the first save with no cover assigned, grab a viewport thumbnail so the
      // home-screen card isn't blank — captured at most once per session, never over an
      // existing cover (see applyAutoCover). Games only auto-capture on autosaves (manual saves
      // let users set a cover explicitly); the Modeling Studio only saves manually, so model
      // projects auto-capture there too, using the Studio's registered viewport capturer.
      if (opts?.snapshot !== 'manual' || projectKind === 'model') applyAutoCover(gameId, settings);
      await api.patchGame(gameId, { activeSceneId: sceneId, settings });
      set({ gameSettings: settings });

      // Revert-snapshot: always for manual saves, rate-limited for autosaves.
      const kind = opts?.snapshot;
      const due = kind === 'manual' || (kind === 'auto' && Date.now() - (get().lastSnapshotAt ?? 0) > AUTO_SNAPSHOT_INTERVAL);
      if (kind && due) {
        await api.createVersion(sceneId, {
          kind: kind === 'manual' ? 'manual' : 'auto',
          label: opts?.label,
          entities: ed.entities,
          gameCamera: ed.gameCamera,
          gridVisible: ed.gridVisible,
          scripts,
        });
        set({ lastSnapshotAt: Date.now() });
        if (get().showHistory) void get().loadVersions();
      }
      set({ saving: false, dirty: false, lastSavedAt: Date.now() });
    } catch (e) {
      set({ error: (e as Error).message, saving: false });
    }
  },

  setAutosave: (v) => set({ autosaveEnabled: v }),

  loadVersions: async () => {
    const sid = get().sceneId;
    if (!sid) return;
    set({ versionsLoading: true });
    try {
      set({ versions: await api.listVersions(sid), versionsLoading: false });
    } catch (e) {
      set({ error: (e as Error).message, versionsLoading: false });
    }
  },

  setShowHistory: (v) => {
    set({ showHistory: v });
    if (v) void get().loadVersions();
  },

  restoreVersion: async (id) => {
    try {
      const v = await api.getVersion(id);
      useEditorStore.getState().hydrateScripts(rowsToScripts(v.scripts as ScriptRow[]));
      useEditorStore.getState().hydrateScene({
        entities: v.entities,
        gameCamera: v.gameCamera,
        gridVisible: v.gridVisible,
      });
      set({ dirty: true, showHistory: false });
      // Persist the restored state as a new manual checkpoint.
      await get().save({ snapshot: 'manual', label: 'Reverted' });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  switchScene: async (sceneId) => {
    if (sceneId === get().sceneId) return;
    await get().save(); // persist the scene we're leaving
    try {
      const scene = await api.getScene(sceneId);
      useEditorStore.getState().hydrateScene({
        entities: scene.entities,
        gameCamera: scene.gameCamera,
        gridVisible: scene.gridVisible,
      });
      set({ sceneId, dirty: false });
      if (get().gameId) await api.patchGame(get().gameId!, { activeSceneId: sceneId });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  addScene: async (name) => {
    const { gameId } = get();
    if (!gameId) return;
    await get().save();
    const meta = await api.createScene(gameId, name);
    useEditorStore.getState().hydrateScene({ entities: starterEntities() });
    set((s) => ({ scenes: [...s.scenes, meta], sceneId: meta.id, dirty: false }));
    await get().save(); // persist the new scene's starter content
  },

  renameScene: async (id, name) => {
    set((s) => ({ scenes: s.scenes.map((sc) => (sc.id === id ? { ...sc, name } : sc)) }));
    await api.patchScene(id, { name });
  },

  deleteScene: async (id) => {
    const { gameId, sceneId } = get();
    if (!gameId) return;
    await api.deleteScene(id);
    const detail = await api.getGame(gameId);
    const nextId = sceneId === id ? (detail.game.activeSceneId ?? detail.scenes[0]?.id ?? null) : sceneId;
    set({ scenes: detail.scenes });
    if (sceneId === id && nextId) {
      const scene = await api.getScene(nextId);
      useEditorStore.getState().hydrateScene({
        entities: scene.entities,
        gameCamera: scene.gameCamera,
        gridVisible: scene.gridVisible,
      });
      set({ sceneId: nextId, dirty: false });
    }
  },

  goHome: async () => {
    if (get().gameId && get().sceneId) await get().save();
    set({ view: 'home', gameId: null, sceneId: null, gameName: '', gameSettings: {}, scenes: [] });
    await get().refreshGames();
  },
}));

// Debounced autosave: persists the live scene + scripts after edits settle, and
// drops a rate-limited revert-snapshot. The in-session undo stack is untouched.
let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleAutosave() {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    const p = useProjectStore.getState();
    if (
      (p.view === 'editor' || p.view === 'modeler') &&
      p.autosaveEnabled &&
      p.dirty &&
      !p.saving &&
      useEditorStore.getState().playState === 'editing'
    ) {
      void p.save({ snapshot: 'auto' });
    }
  }, AUTOSAVE_DEBOUNCE);
}

// Mark the project dirty when scene-affecting editor state changes while editing.
useEditorStore.subscribe((s, prev) => {
  const p = useProjectStore.getState();
  if ((p.view !== 'editor' && p.view !== 'modeler') || p.saving) return;
  if (
    s.entities !== prev.entities ||
    s.scripts !== prev.scripts ||
    s.design !== prev.design ||
    s.prefabs !== prev.prefabs ||
    s.materialPresets !== prev.materialPresets ||
    s.workspace !== prev.workspace ||
    s.gameCamera !== prev.gameCamera ||
    s.gridVisible !== prev.gridVisible
  ) {
    if (!p.dirty) useProjectStore.setState({ dirty: true });
    scheduleAutosave();
  }
});
