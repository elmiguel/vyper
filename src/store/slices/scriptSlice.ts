import { nanoid } from 'nanoid';
import type { Script } from '@/types';
import { generateCode } from '@/nodes/codegen';
import { parseGraph } from '@/nodes/codeparse';
import { starterGraph } from '@/nodes/nodeTypes';
import type { EditorState, StoreSet, StoreGet } from '../editorTypes';

type ScriptSlice = Pick<
  EditorState,
  | 'addScript'
  | 'detachScript'
  | 'setScriptMode'
  | 'updateScriptCode'
  | 'updateScriptGraph'
  | 'regenerateFromGraph'
  | 'toggleScriptEnabled'
>;

/** Script lifecycle plus the bi-directional code ↔ node-graph sync. */
export function createScriptSlice(set: StoreSet, get: StoreGet): ScriptSlice {
  return {
    addScript: (entityId) => {
      get().record('addScript');
      const id = nanoid(8);
      const ent = get().entities.find((e) => e.id === entityId);
      const graph = starterGraph(get().mode);
      const script: Script = {
        id,
        name: `${ent?.name ?? 'Entity'} Behaviour`,
        mode: 'nodes',
        graph,
        code: generateCode(graph),
        enabled: true,
      };
      set((s) => ({
        scripts: { ...s.scripts, [id]: script },
        entities: s.entities.map((e) => (e.id === entityId ? { ...e, scriptIds: [...e.scriptIds, id] } : e)),
        activeScriptId: id,
      }));
      return id;
    },

    detachScript: (entityId, scriptId) => {
      get().record('detachScript');
      set((s) => {
        const scripts = { ...s.scripts };
        delete scripts[scriptId];
        return {
          scripts,
          entities: s.entities.map((e) =>
            e.id === entityId ? { ...e, scriptIds: e.scriptIds.filter((id) => id !== scriptId) } : e,
          ),
          activeScriptId: s.activeScriptId === scriptId ? null : s.activeScriptId,
        };
      });
    },

    setScriptMode: (scriptId, mode) => {
      get().record(`scriptMode:${scriptId}`);
      set((s) => {
        const sc = s.scripts[scriptId];
        if (!sc) return s;
        // Switching back to nodes: regenerate code so it matches the graph again.
        const code = mode === 'nodes' && !sc.codeDirty ? generateCode(sc.graph) : sc.code;
        return { scripts: { ...s.scripts, [scriptId]: { ...sc, mode, code } } };
      });
    },

    updateScriptCode: (scriptId, code) => {
      get().record(`code:${scriptId}`);
      set((s) => {
        const sc = s.scripts[scriptId];
        if (!sc) return s;
        // Bi-directional sync: try to rebuild the node graph from the edited code.
        // If it parses, the graph follows the code and stays in sync (codeDirty:false).
        // If the code uses anything the nodes can't represent, keep the code as the
        // source of truth and mark the graph out of date (codeDirty:true) instead of
        // silently dropping the graph.
        const graph = parseGraph(code);
        if (graph) {
          return { scripts: { ...s.scripts, [scriptId]: { ...sc, code, graph, codeDirty: false } } };
        }
        return { scripts: { ...s.scripts, [scriptId]: { ...sc, code, codeDirty: true } } };
      });
    },

    updateScriptGraph: (scriptId, graph) => {
      get().record(`graph:${scriptId}`);
      set((s) => {
        const sc = s.scripts[scriptId];
        if (!sc) return s;
        // Node graph is the source of truth in node mode → regenerate code unless the user hand-edited.
        const code = sc.mode === 'nodes' && !sc.codeDirty ? generateCode(graph) : sc.code;
        return { scripts: { ...s.scripts, [scriptId]: { ...sc, graph, code } } };
      });
    },

    regenerateFromGraph: (scriptId) => {
      get().record(`regen:${scriptId}`);
      set((s) => {
        const sc = s.scripts[scriptId];
        if (!sc) return s;
        return { scripts: { ...s.scripts, [scriptId]: { ...sc, code: generateCode(sc.graph), codeDirty: false } } };
      });
    },

    toggleScriptEnabled: (scriptId) => {
      get().record(`toggleScript:${scriptId}`);
      set((s) => {
        const sc = s.scripts[scriptId];
        if (!sc) return s;
        return { scripts: { ...s.scripts, [scriptId]: { ...sc, enabled: !sc.enabled } } };
      });
    },
  };
}
