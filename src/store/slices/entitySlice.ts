import { nanoid } from 'nanoid';
import type { Script, ScriptGraph } from '@/types';
import { generateCode } from '@/nodes/codegen';
import { makeNode } from '@/nodes/nodeTypes';
import type { EditorState, StoreSet, StoreGet } from '../editorTypes';
import { makeEntity, uniqueName, nextColor, v3 } from '../editorDefaults';

type EntitySlice = Pick<
  EditorState,
  | 'addPrimitive'
  | 'addVolume'
  | 'setTrigger'
  | 'addPlayer'
  | 'addLight'
  | 'removeEntity'
  | 'duplicateEntity'
  | 'renameEntity'
  | 'setEntityTag'
  | 'updateTransform'
  | 'updateMesh'
  | 'updateLight'
  | 'setPhysics'
  | 'setProp'
>;

/** Entity authoring: create/remove/duplicate, transforms, mesh/light/physics edits. */
export function createEntitySlice(set: StoreSet, get: StoreGet): EntitySlice {
  return {
    addPrimitive: (kind) => {
      get().record('add');
      const name = uniqueName(kind === 'empty' ? 'Empty' : kind[0].toUpperCase() + kind.slice(1));
      // 2D shapes sit on the z=0 plane at the origin; 3D solids rest on the floor.
      const is2D = get().mode === '2d';
      const y = is2D || kind === 'ground' || kind === 'plane' ? 0 : 1;
      const e = makeEntity({
        name,
        mesh: kind === 'empty' ? undefined : { kind, color: nextColor(), visible: true },
        transform: { position: v3(0, y, 0), rotation: v3(), scale: v3(1, 1, 1) },
      });
      set((s) => ({ entities: [...s.entities, e], selectedId: e.id, sceneRevision: s.sceneRevision + 1 }));
      return e.id;
    },

    addVolume: (kind) => {
      get().record('addVolume');
      const name = uniqueName('Trigger');
      const e = makeEntity({
        name,
        mesh: { kind, color: '#3affc0', visible: true },
        trigger: { enabled: true, once: false, filter: [] },
        transform: { position: v3(0, get().mode === '2d' ? 0 : 1, 0), rotation: v3(), scale: v3(2, 2, 2) },
      });
      set((s) => ({ entities: [...s.entities, e], selectedId: e.id, sceneRevision: s.sceneRevision + 1 }));
      return e.id;
    },

    setTrigger: (id, patch) => {
      get().record(`trigger:${id}`);
      set((s) => ({
        entities: s.entities.map((e) =>
          e.id === id
            ? { ...e, trigger: { enabled: true, once: false, filter: [], ...e.trigger, ...patch } }
            : e,
        ),
        sceneRevision: s.sceneRevision + 1,
      }));
    },

    addPlayer: () => {
      get().record('add');
      const is2D = get().mode === '2d';
      // A controller node = a full movement behaviour (codegen splices its template
      // into onStart/onUpdate). 2D moves on the XY plane; 3D uses a mouse-look
      // third-person camera + WASD so you can see the player you're driving.
      const controllerKind = is2D ? 'asset/playerController2D' : 'asset/thirdPersonController';
      const graph: ScriptGraph = { nodes: [makeNode(controllerKind, { x: 80, y: 80 })], edges: [] };
      const scriptId = nanoid(8);
      const script: Script = {
        id: scriptId,
        name: 'Player Controller',
        mode: 'nodes',
        graph,
        code: generateCode(graph),
        enabled: true,
      };
      const player = makeEntity({
        name: uniqueName('Player'),
        mesh: { kind: is2D ? 'square' : 'box', color: '#4f9bff', visible: true },
        transform: { position: v3(0, is2D ? 0 : 1, 0), rotation: v3(), scale: v3(1, 1, 1) },
        scriptIds: [scriptId],
        props: { speed: 5 },
      });
      set((s) => ({
        entities: [...s.entities, player],
        scripts: { ...s.scripts, [scriptId]: script },
        selectedId: player.id,
        activeScriptId: scriptId,
        sceneRevision: s.sceneRevision + 1,
      }));
      return player.id;
    },

    addLight: (kind) => {
      get().record('add');
      const e = makeEntity({
        name: uniqueName(`${kind[0].toUpperCase()}${kind.slice(1)} Light`),
        light: { kind, color: '#ffffff', intensity: kind === 'hemispheric' ? 0.7 : 1 },
        transform: { position: v3(0, 6, 0), rotation: v3(-45, 0, 0), scale: v3(1, 1, 1) },
      });
      set((s) => ({ entities: [...s.entities, e], selectedId: e.id, sceneRevision: s.sceneRevision + 1 }));
      return e.id;
    },

    removeEntity: (id) => {
      get().record('delete');
      set((s) => {
        const removed = s.entities.find((e) => e.id === id);
        const scripts = { ...s.scripts };
        removed?.scriptIds.forEach((sid) => delete scripts[sid]);
        return {
          entities: s.entities.filter((e) => e.id !== id && e.parentId !== id),
          scripts,
          selectedId: s.selectedId === id ? null : s.selectedId,
          sceneRevision: s.sceneRevision + 1,
        };
      });
    },

    duplicateEntity: (id) => {
      get().record('duplicate');
      set((s) => {
        const src = s.entities.find((e) => e.id === id);
        if (!src) return s;
        const scripts = { ...s.scripts };
        const newScriptIds = src.scriptIds.map((sid) => {
          const orig = s.scripts[sid];
          const nid = nanoid(8);
          scripts[nid] = { ...orig, id: nid, graph: structuredClone(orig.graph) };
          return nid;
        });
        const copy = makeEntity({
          ...structuredClone(src),
          name: uniqueName(src.name),
          scriptIds: newScriptIds,
        });
        return { entities: [...s.entities, copy], scripts, selectedId: copy.id, sceneRevision: s.sceneRevision + 1 };
      });
    },

    renameEntity: (id, name) => {
      get().record(`rename:${id}`);
      set((s) => ({ entities: s.entities.map((e) => (e.id === id ? { ...e, name } : e)) }));
    },

    setEntityTag: (id, tag) => {
      get().record(`tag:${id}`);
      set((s) => ({ entities: s.entities.map((e) => (e.id === id ? { ...e, tag: tag || undefined } : e)) }));
    },

    updateTransform: (id, patch) => {
      get().record(`transform:${id}:${Object.keys(patch).join(',')}`);
      set((s) => ({
        entities: s.entities.map((e) =>
          e.id === id ? { ...e, transform: { ...e.transform, ...patch } } : e,
        ),
        // Bump so the viewport re-applies the transform to the mesh (cheap reconcile).
        sceneRevision: s.sceneRevision + 1,
      }));
    },

    updateMesh: (id, patch) => {
      get().record(`mesh:${id}`);
      set((s) => ({
        entities: s.entities.map((e) =>
          e.id === id && e.mesh ? { ...e, mesh: { ...e.mesh, ...patch } } : e,
        ),
        sceneRevision: s.sceneRevision + 1,
      }));
    },

    updateLight: (id, patch) => {
      get().record(`light:${id}`);
      set((s) => ({
        entities: s.entities.map((e) =>
          e.id === id && e.light ? { ...e, light: { ...e.light, ...patch } } : e,
        ),
        sceneRevision: s.sceneRevision + 1,
      }));
    },

    setPhysics: (id, patch) => {
      get().record(`physics:${id}`);
      set((s) => ({
        entities: s.entities.map((e) =>
          e.id === id
            ? {
                ...e,
                physics: {
                  // Sensible defaults the first time physics is enabled on an entity.
                  enabled: true,
                  type: 'dynamic',
                  mass: 1,
                  restitution: 0.2,
                  friction: 0.6,
                  shape: 'auto',
                  ...e.physics,
                  ...patch,
                },
              }
            : e,
        ),
        sceneRevision: s.sceneRevision + 1,
      }));
    },

    setProp: (id, key, value) => {
      get().record(`prop:${id}:${key}`);
      set((s) => ({
        entities: s.entities.map((e) => (e.id === id ? { ...e, props: { ...e.props, [key]: value } } : e)),
      }));
    },
  };
}
