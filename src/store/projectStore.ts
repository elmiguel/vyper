import { create } from 'zustand';
import { api, type GameSummary, type SceneMeta, type ScriptRow, type VersionMeta } from '@/data';
import { useEditorStore, starterEntities } from './editorStore';
import { hmrSingleton } from './hmrStore';
import { applyAutoCover, captureViewportCover, resetAutoCover } from './projectCover';
import { loadGlobalLibrary, setLastGame } from './globalLibrary';
import type { Asset, GameMode } from '@/types';
import { defaultWorkspace } from './slices/workspaceSlice';
import {
  modelStarterEntities,
  gameModeOf,
  designOf,
  prefabsOf,
  generatedAssetsOf,
  materialsOf,
  workspaceOf,
  editorSettingsOf,
  isModelProject,
  rowsToScripts,
} from './projectSettings';

// Settings codecs live in ./projectSettings; re-exported here to preserve the import
// surface (`import { designOf } from '@/store/projectStore'`) used across the app + tests.
export { gameModeOf, designOf, prefabsOf, generatedAssetsOf, materialsOf, workspaceOf, editorSettingsOf, isModelProject };

type View = 'home' | 'loading' | 'editor' | 'modeler';
type SnapshotKind = 'auto' | 'manual' | false;

const AUTOSAVE_DEBOUNCE = 3500; // ms of inactivity before autosaving
const AUTO_SNAPSHOT_INTERVAL = 120_000; // min ms between auto revert-snapshots

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

// Wrapped in hmrSingleton so a Vite hot-update can't mint a second project store. The editor store
// is already a singleton; if THIS one duplicated, a stale copy would keep an old gameId/sceneId
// while the shared editor holds another project's content — and its leftover autosave subscription
// would persist one project's entities into another project's scene (observed data loss).
export const useProjectStore = hmrSingleton('project', () => create<ProjectState>((set, get) => ({
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
    clearAutosave();
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
      await setLastGame(detail.game.id);
    } catch (e) {
      set({ error: (e as Error).message, view: 'home' });
    }
  },

  newModel: async (name) => {
    clearAutosave();
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
      await setLastGame(detail.game.id);
    } catch (e) {
      set({ error: (e as Error).message, view: 'home' });
    }
  },

  openGame: async (id) => {
    clearAutosave(); // drop any autosave armed for the project we're leaving
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
      useEditorStore.getState().hydrateGeneratedAssets(generatedAssetsOf(detail.game.settings));
      useEditorStore.getState().hydrateEditorPrefs(editorSettingsOf(detail.game.settings));
      // Merge the shared reference library *over* the project's local copies, so reference (proxy)
      // assets resolve to the canonical, latest version before the scene's linked instances re-sync.
      const sharedLibrary = await loadGlobalLibrary();
      if (sharedLibrary.length) useEditorStore.getState().hydrateGeneratedAssets(sharedLibrary);
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
      await setLastGame(detail.game.id);
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
      const settings: Record<string, unknown> = { ...get().gameSettings, kind: projectKind, design: ed.design, prefabs: ed.prefabs, materials: ed.materialPresets, workspace: ed.workspace, editorSettings: ed.editorPrefs, generatedAssets: ed.assetLibrary.assets.filter((a) => a.source === 'generated') };
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
    clearAutosave();
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
    clearAutosave();
    if (get().gameId && get().sceneId) await get().save();
    set({ view: 'home', gameId: null, sceneId: null, gameName: '', gameSettings: {}, scenes: [] });
    await get().refreshGames();
  },
})));

// Debounced autosave: persists the live scene + scripts after edits settle, and
// drops a rate-limited revert-snapshot. The in-session undo stack is untouched.
// The timer handle lives on globalThis so it survives HMR re-evaluation — a navigation in the new
// module must be able to cancel a timer armed by the old one.
const timerBox = globalThis as unknown as { __vyper_autosave_timer?: ReturnType<typeof setTimeout> | null };
/** Cancel any pending autosave. Called on every project/scene navigation so a timer armed for one
 *  project can never fire against the next — otherwise the still-shared editor store would persist
 *  the previous project's entities into whatever scene is now loaded (cross-project corruption). */
function clearAutosave() {
  if (timerBox.__vyper_autosave_timer) clearTimeout(timerBox.__vyper_autosave_timer);
  timerBox.__vyper_autosave_timer = null;
}
function scheduleAutosave() {
  if (timerBox.__vyper_autosave_timer) clearTimeout(timerBox.__vyper_autosave_timer);
  // Remember the project + scene this autosave is for. If the user navigates away before it fires,
  // the loaded project won't match and we abort — we must never write one project's scene to another.
  const { gameId, sceneId } = useProjectStore.getState();
  timerBox.__vyper_autosave_timer = setTimeout(() => {
    timerBox.__vyper_autosave_timer = null;
    const p = useProjectStore.getState();
    if (
      (p.view === 'editor' || p.view === 'modeler') &&
      p.gameId === gameId &&
      p.sceneId === sceneId &&
      p.autosaveEnabled &&
      p.dirty &&
      !p.saving &&
      useEditorStore.getState().playState === 'editing'
    ) {
      void p.save({ snapshot: 'auto' });
    }
  }, AUTOSAVE_DEBOUNCE);
}

/** Signature of project-owned (generated) assets so changes to them — make/republish/reference
 *  toggle — mark the project dirty, while builtin/uploaded manifest loads (not generated) don't. */
function genAssetsSig(assets: Asset[]): string {
  let sig = '';
  for (const a of assets) if (a.source === 'generated') sig += `${a.id}:${a.reference ? 1 : 0}:${a.geometry?.positions.length ?? 0}|`;
  return sig;
}

// Mark the project dirty when scene-affecting editor state changes while editing.
// Registered exactly once across HMR: a hot-update re-evaluating this module would otherwise stack
// a second subscription (each firing its own autosave — the tell-tale duplicate snapshots), so we
// dispose any prior registration before adding a new one.
{
  const g = globalThis as unknown as Record<string, unknown>;
  const prevUnsub = g.__vyper_project_sub as undefined | (() => void);
  if (prevUnsub) prevUnsub();
  g.__vyper_project_sub = useEditorStore.subscribe((s, prev) => {
    const p = useProjectStore.getState();
    if ((p.view !== 'editor' && p.view !== 'modeler') || p.saving) return;
    if (
      s.entities !== prev.entities ||
      s.scripts !== prev.scripts ||
      s.design !== prev.design ||
      s.prefabs !== prev.prefabs ||
      s.materialPresets !== prev.materialPresets ||
      s.workspace !== prev.workspace ||
      s.editorPrefs !== prev.editorPrefs ||
      s.gameCamera !== prev.gameCamera ||
      s.gridVisible !== prev.gridVisible ||
      (s.assetLibrary !== prev.assetLibrary && genAssetsSig(s.assetLibrary.assets) !== genAssetsSig(prev.assetLibrary.assets))
    ) {
      if (!p.dirty) useProjectStore.setState({ dirty: true });
      scheduleAutosave();
    }
  });
}
