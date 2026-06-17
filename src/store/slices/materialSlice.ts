import { nanoid } from 'nanoid';
import type { MaterialConfig, MaterialPreset } from '@/types';
import type { EditorState, StoreSet, StoreGet } from '../editorTypes';

type MaterialSlice = Pick<
  EditorState,
  'saveMaterialPreset' | 'applyMaterialPreset' | 'removeMaterialPreset' | 'hydrateMaterialPresets'
>;

/**
 * Material presets: named, reusable materials saved at the game level (persisted
 * in `games.settings.materials`). Imported CC0 materials register here, and any
 * mesh's material can be saved as one. Applying a preset replaces the target
 * mesh's material wholesale (a fresh clone), so stale maps don't linger.
 */
export function createMaterialSlice(set: StoreSet, get: StoreGet): MaterialSlice {
  return {
    saveMaterialPreset: (name, material) => {
      // Reuse an existing preset with the same name (e.g. re-importing a CC0 material).
      const existing = Object.values(get().materialPresets).find((p) => p.name === name);
      const id = existing?.id ?? nanoid(8);
      const preset: MaterialPreset = { id, name, material: structuredClone(material) };
      set((s) => ({ materialPresets: { ...s.materialPresets, [id]: preset } }));
      return id;
    },

    applyMaterialPreset: (entityId, presetId) => {
      const preset = get().materialPresets[presetId];
      if (!preset) return;
      get().record(`material:${entityId}`);
      set((s) => ({
        entities: s.entities.map((e) =>
          e.id === entityId && e.mesh ? { ...e, mesh: { ...e.mesh, material: structuredClone(preset.material) } } : e,
        ),
        sceneRevision: s.sceneRevision + 1,
      }));
    },

    removeMaterialPreset: (presetId) =>
      set((s) => {
        const next = { ...s.materialPresets };
        delete next[presetId];
        return { materialPresets: next };
      }),

    hydrateMaterialPresets: (presets: Record<string, MaterialPreset>) => set({ materialPresets: presets ?? {} }),
  };
}
