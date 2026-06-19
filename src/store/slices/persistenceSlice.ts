import { emptyDesign } from '@/types';
import type { EditorState, StoreSet } from '../editorTypes';
import { defaultEntities, defaultGameCamera, dedupeEntityIds, syncLinkedEntities } from '../editorDefaults';

type PersistenceSlice = Pick<
  EditorState,
  'hydrateScene' | 'hydrateDesign' | 'hydrateScripts' | 'loadStarterScene'
>;

/** Load a scene/design/scripts from the backend, or seed a fresh starter game. */
export function createPersistenceSlice(set: StoreSet): PersistenceSlice {
  return {
    hydrateScene: (data) =>
      set((s) => ({
        // Repair duplicate ids (dedupeEntityIds), then re-sync linked/proxy instances from their
        // source assets so references reflect the latest source object on load.
        entities: syncLinkedEntities(dedupeEntityIds(data.entities), s.assetLibrary.assets),
        gameCamera: data.gameCamera && data.gameCamera.position ? data.gameCamera : defaultGameCamera(s.mode),
        gridVisible: data.gridVisible ?? true,
        selectedId: null,
        activeScriptId: null,
        playState: 'editing',
        past: [],
        future: [],
        sceneRevision: s.sceneRevision + 1,
        cameraRevision: s.cameraRevision + 1,
      })),

    hydrateDesign: (design) => set({ design }),

    hydrateScripts: (scripts) => set({ scripts, activeScriptId: null }),

    loadStarterScene: () =>
      set((s) => ({
        entities: defaultEntities(s.mode),
        scripts: {},
        design: emptyDesign(),
        gameCamera: defaultGameCamera(s.mode),
        gridVisible: true,
        selectedId: null,
        activeScriptId: null,
        playState: 'editing',
        past: [],
        future: [],
        sceneRevision: s.sceneRevision + 1,
        cameraRevision: s.cameraRevision + 1,
      })),
  };
}
