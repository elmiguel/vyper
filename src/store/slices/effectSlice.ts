import { makeEffectInstance } from '@/effects/presets';
import type { EditorState, StoreSet, StoreGet } from '../editorTypes';

type EffectSlice = Pick<
  EditorState,
  'addEffect' | 'updateEffect' | 'renameEffect' | 'removeEffect' | 'toggleEffectEnabled'
>;

/** Particle-VFX instances attached to an entity (add / edit / rename / toggle). */
export function createEffectSlice(set: StoreSet, get: StoreGet): EffectSlice {
  return {
    addEffect: (entityId, presetId) => {
      get().record('addEffect');
      const fx = makeEffectInstance(presetId);
      set((s) => ({
        entities: s.entities.map((e) =>
          e.id === entityId ? { ...e, effects: [...(e.effects ?? []), fx] } : e,
        ),
        activeEffect: { entityId, effectId: fx.id },
        sceneRevision: s.sceneRevision + 1,
      }));
      return fx.id;
    },

    updateEffect: (entityId, effectId, patch) => {
      get().record(`effect:${effectId}`);
      set((s) => ({
        entities: s.entities.map((e) =>
          e.id === entityId
            ? {
                ...e,
                effects: (e.effects ?? []).map((fx) =>
                  fx.id === effectId ? { ...fx, config: { ...fx.config, ...patch } } : fx,
                ),
              }
            : e,
        ),
        sceneRevision: s.sceneRevision + 1,
      }));
    },

    renameEffect: (entityId, effectId, name) => {
      get().record(`effectName:${effectId}`);
      set((s) => ({
        entities: s.entities.map((e) =>
          e.id === entityId
            ? { ...e, effects: (e.effects ?? []).map((fx) => (fx.id === effectId ? { ...fx, name } : fx)) }
            : e,
        ),
      }));
    },

    removeEffect: (entityId, effectId) => {
      get().record('removeEffect');
      set((s) => ({
        entities: s.entities.map((e) =>
          e.id === entityId ? { ...e, effects: (e.effects ?? []).filter((fx) => fx.id !== effectId) } : e,
        ),
        activeEffect: s.activeEffect?.effectId === effectId ? null : s.activeEffect,
        sceneRevision: s.sceneRevision + 1,
      }));
    },

    toggleEffectEnabled: (entityId, effectId) => {
      get().record('toggleEffect');
      set((s) => ({
        entities: s.entities.map((e) =>
          e.id === entityId
            ? {
                ...e,
                effects: (e.effects ?? []).map((fx) =>
                  fx.id === effectId ? { ...fx, enabled: !fx.enabled } : fx,
                ),
              }
            : e,
        ),
        sceneRevision: s.sceneRevision + 1,
      }));
    },
  };
}
