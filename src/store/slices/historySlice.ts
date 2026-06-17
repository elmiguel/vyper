import { nanoid } from 'nanoid';
import type { EditorState, Snapshot, StoreSet, StoreGet } from '../editorTypes';
import { HISTORY_LIMIT, COALESCE_MS, makeEntity, uniqueName, v3 } from '../editorDefaults';

// Rapid same-label edits (dragging a field, typing code) collapse into one undo step.
let lastLabel = '';
let lastRecordAt = -Infinity;

type HistorySlice = Pick<EditorState, 'record' | 'undo' | 'redo' | 'copySelected' | 'paste'>;

/** Snapshot-based undo/redo plus copy/paste of the selected entity + its scripts. */
export function createHistorySlice(set: StoreSet, get: StoreGet): HistorySlice {
  return {
    record: (label) =>
      set((s) => {
        const now = performance.now();
        if (label && label === lastLabel && now - lastRecordAt < COALESCE_MS) {
          lastRecordAt = now;
          return s; // coalesce into the burst's first snapshot
        }
        lastLabel = label;
        lastRecordAt = now;
        const snap: Snapshot = {
          entities: structuredClone(s.entities),
          scripts: structuredClone(s.scripts),
          selectedId: s.selectedId,
        };
        const past = [...s.past, snap];
        if (past.length > HISTORY_LIMIT) past.shift();
        return { past, future: [] };
      }),

    undo: () =>
      set((s) => {
        if (!s.past.length) return s;
        lastLabel = '';
        const past = s.past.slice();
        const prev = past.pop()!;
        const current: Snapshot = {
          entities: structuredClone(s.entities),
          scripts: structuredClone(s.scripts),
          selectedId: s.selectedId,
        };
        return { ...prev, past, future: [...s.future, current], sceneRevision: s.sceneRevision + 1 };
      }),

    redo: () =>
      set((s) => {
        if (!s.future.length) return s;
        lastLabel = '';
        const future = s.future.slice();
        const next = future.pop()!;
        const current: Snapshot = {
          entities: structuredClone(s.entities),
          scripts: structuredClone(s.scripts),
          selectedId: s.selectedId,
        };
        return { ...next, future, past: [...s.past, current], sceneRevision: s.sceneRevision + 1 };
      }),

    copySelected: () =>
      set((s) => {
        const e = s.entities.find((x) => x.id === s.selectedId);
        if (!e) return s;
        const scripts = e.scriptIds.map((id) => s.scripts[id]).filter(Boolean);
        return { clipboard: { entity: structuredClone(e), scripts: structuredClone(scripts) } };
      }),

    paste: () => {
      if (!get().clipboard) return;
      get().record('paste');
      set((s) => {
        const clip = s.clipboard!;
        const scripts = { ...s.scripts };
        const newScriptIds = clip.scripts.map((orig) => {
          const nid = nanoid(8);
          scripts[nid] = { ...structuredClone(orig), id: nid };
          return nid;
        });
        const pos = clip.entity.transform.position;
        // Drop the clipboard entity's id so makeEntity assigns a fresh one — keeping
        // it would collide with the original (or a prior paste) and render as one mesh.
        const { id: _clipId, ...rest } = structuredClone(clip.entity);
        const copy = makeEntity({
          ...rest,
          name: uniqueName(clip.entity.name),
          scriptIds: newScriptIds,
          transform: {
            ...structuredClone(clip.entity.transform),
            position: v3(pos.x + 1, pos.y, pos.z + 1),
          },
        });
        return { entities: [...s.entities, copy], scripts, selectedId: copy.id, sceneRevision: s.sceneRevision + 1 };
      });
    },
  };
}
