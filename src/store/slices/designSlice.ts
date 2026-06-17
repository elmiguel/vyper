import { nanoid } from 'nanoid';
import type { HudWidget, Objective } from '@/types';
import { emptyHud, defaultRenderSettings } from '@/types';
import { makeHudWidget } from '@/hud/hudAssets';
import type { EditorState, StoreSet } from '../editorTypes';

type DesignSlice = Pick<
  EditorState,
  | 'updateDesign'
  | 'addObjective'
  | 'updateObjective'
  | 'removeObjective'
  | 'updateRenderSettings'
  | 'setShowHud'
  | 'selectHudWidget'
  | 'addHudWidget'
  | 'updateHudWidget'
  | 'removeHudWidget'
  | 'duplicateHudWidget'
  | 'reorderHudWidget'
>;

/** Game design doc: objectives/goals and the shared HUD editor (design.hud). */
export function createDesignSlice(set: StoreSet): DesignSlice {
  return {
    updateDesign: (patch) => set((s) => ({ design: { ...s.design, ...patch } })),

    addObjective: () => {
      const id = nanoid(8);
      const obj: Objective = {
        id,
        title: '',
        description: '',
        priority: 'primary',
        metric: 'flag',
        target: 1,
        reward: '',
      };
      set((s) => ({ design: { ...s.design, objectives: [...s.design.objectives, obj] } }));
      return id;
    },

    updateObjective: (id, patch) =>
      set((s) => ({
        design: {
          ...s.design,
          objectives: s.design.objectives.map((o) => (o.id === id ? { ...o, ...patch } : o)),
        },
      })),

    removeObjective: (id) =>
      set((s) => ({
        design: { ...s.design, objectives: s.design.objectives.filter((o) => o.id !== id) },
      })),

    // Scene-wide render settings live on the design doc (game-level), so they
    // persist/hydrate through the same channel as goals/HUD. The engine watches
    // `design.render` and re-applies the pipeline when it changes.
    updateRenderSettings: (patch) =>
      set((s) => ({
        // Merge over a complete default base so an in-memory render block persisted
        // before newer fields existed is back-filled rather than kept partial.
        design: { ...s.design, render: { ...defaultRenderSettings(), ...(s.design.render ?? {}), ...patch } },
      })),

    // ----- HUD editor (design.hud) -----
    setShowHud: (v) => set({ showHud: v }),
    selectHudWidget: (id) => set({ selectedHudId: id }),

    addHudWidget: (kind) => {
      const w = makeHudWidget(kind);
      set((s) => {
        const hud = s.design.hud ?? emptyHud();
        return { design: { ...s.design, hud: { widgets: [...hud.widgets, w] } }, selectedHudId: w.id };
      });
      return w.id;
    },

    updateHudWidget: (id, patch) =>
      set((s) => {
        const hud = s.design.hud ?? emptyHud();
        return {
          design: { ...s.design, hud: { widgets: hud.widgets.map((w) => (w.id === id ? { ...w, ...patch } : w)) } },
        };
      }),

    removeHudWidget: (id) =>
      set((s) => {
        const hud = s.design.hud ?? emptyHud();
        return {
          design: { ...s.design, hud: { widgets: hud.widgets.filter((w) => w.id !== id) } },
          selectedHudId: s.selectedHudId === id ? null : s.selectedHudId,
        };
      }),

    duplicateHudWidget: (id) => {
      set((s) => {
        const hud = s.design.hud ?? emptyHud();
        const src = hud.widgets.find((w) => w.id === id);
        if (!src) return s;
        const copy: HudWidget = { ...src, id: nanoid(8), name: `${src.name} copy`, x: Math.min(src.x + 3, 96), y: Math.min(src.y + 3, 96) };
        return { design: { ...s.design, hud: { widgets: [...hud.widgets, copy] } }, selectedHudId: copy.id };
      });
    },

    reorderHudWidget: (id, place) => {
      set((s) => {
        const hud = s.design.hud ?? emptyHud();
        const w = hud.widgets.find((x) => x.id === id);
        if (!w) return s;
        const rest = hud.widgets.filter((x) => x.id !== id);
        // Draw order is array order; last drawn renders on top.
        const widgets = place === 'front' ? [...rest, w] : [w, ...rest];
        return { design: { ...s.design, hud: { widgets } } };
      });
    },
  };
}
