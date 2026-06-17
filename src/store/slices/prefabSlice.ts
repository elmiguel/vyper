import { nanoid } from 'nanoid';
import type { PrefabDef, Script } from '@/types';
import { makeEntity, uniqueName } from '../editorDefaults';
import type { EditorState, StoreSet, StoreGet } from '../editorTypes';

type PrefabSlice = Pick<EditorState, 'savePrefab' | 'instantiatePrefab' | 'removePrefab' | 'hydratePrefabs'>;

/**
 * Prefabs: reusable entity templates saved at the game level (persisted in
 * `games.settings.prefabs`). `savePrefab` captures an entity + its behaviours;
 * `instantiatePrefab` stamps a fresh copy into the scene, minting new entity and
 * script ids (the same clone approach as `duplicateEntity`).
 */
export function createPrefabSlice(set: StoreSet, get: StoreGet): PrefabSlice {
  return {
    savePrefab: (entityId, name) => {
      const s = get();
      const src = s.entities.find((e) => e.id === entityId);
      if (!src) return '';
      const scripts = src.scriptIds.map((sid) => s.scripts[sid]).filter(Boolean) as Script[];
      const id = nanoid(8);
      const prefab: PrefabDef = {
        id,
        name: name.trim() || src.name,
        entity: structuredClone(src),
        scripts: structuredClone(scripts),
      };
      set((st) => ({ prefabs: { ...st.prefabs, [id]: prefab } }));
      return id;
    },

    instantiatePrefab: (prefabId) => {
      get().record('add');
      const prefab = get().prefabs[prefabId];
      if (!prefab) return '';
      // Clone behaviours with fresh ids, remapping the entity's scriptIds.
      const scripts = { ...get().scripts };
      const newScriptIds = prefab.scripts.map((orig) => {
        const nid = nanoid(8);
        scripts[nid] = { ...structuredClone(orig), id: nid };
        return nid;
      });
      // Strip the template id so makeEntity mints a new one.
      const { id: _drop, ...rest } = structuredClone(prefab.entity);
      const entity = makeEntity({ ...rest, name: uniqueName(prefab.name), scriptIds: newScriptIds });
      set((s) => ({
        entities: [...s.entities, entity],
        scripts,
        selectedId: entity.id,
        sceneRevision: s.sceneRevision + 1,
      }));
      return entity.id;
    },

    removePrefab: (prefabId) =>
      set((s) => {
        const next = { ...s.prefabs };
        delete next[prefabId];
        return { prefabs: next };
      }),

    hydratePrefabs: (prefabs) => set({ prefabs: prefabs ?? {} }),
  };
}
