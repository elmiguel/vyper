import type { Edge, Node } from '@xyflow/react';
import type { GameMode, ScriptGraph } from '@/types';
import type { NodeCategory, NodeSpec } from './nodeSpec.types';
import { coreSpecs } from './nodeSpecs.core';
import { extraSpecs } from './nodeSpecs.extra';

export type { DataKind, NodeCategory, PortSpec, NodeSpec, EngineNodeData } from './nodeSpec.types';
import type { EngineNodeData } from './nodeSpec.types';

export const NODE_SPECS: Record<string, NodeSpec> = { ...coreSpecs, ...extraSpecs };

export const NODE_PALETTE: { category: NodeCategory; items: string[] }[] = [
  { category: 'event', items: ['event/start', 'event/update'] },
  { category: 'trigger', items: ['trigger/onEnter', 'trigger/onExit', 'trigger/onStay'] },
  {
    category: 'action',
    items: ['action/log', 'action/translate', 'action/rotate', 'action/setPosition', 'action/setProp', 'action/branch'],
  },
  {
    category: 'value',
    items: ['value/number', 'value/vec3', 'value/object', 'value/position', 'value/prop', 'value/time', 'value/key', 'value/math'],
  },
  {
    category: 'physics',
    items: [
      'physics/setVelocity',
      'physics/applyImpulse',
      'physics/applyForce',
      'physics/getVelocity',
      'physics/isGrounded',
      'physics/raycast',
      'physics/onCollision',
    ],
  },
  {
    category: 'objective',
    items: ['objective/complete', 'objective/addProgress', 'objective/isComplete', 'objective/progress'],
  },
  {
    category: 'fx',
    items: ['fx/playEffect', 'fx/stopEffect'],
  },
  {
    category: 'camera',
    items: ['camera/moveTo', 'camera/lookAt', 'camera/follow', 'camera/shake'],
  },
  {
    category: 'world',
    items: [
      'world/setVisible',
      'world/setActive',
      'world/destroy',
      'world/teleport',
      'world/setVelocity',
      'world/applyImpulse',
      'world/playEffect',
    ],
  },
  {
    category: 'assets',
    items: ['asset/playerController2D', 'asset/firstPersonController', 'asset/thirdPersonController'],
  },
];

/** Asset kinds that are plug-and-play macro controllers (one node = full behaviour). */
export const ASSET_KINDS = ['asset/playerController2D', 'asset/firstPersonController', 'asset/thirdPersonController'] as const;

export function defaultFields(kind: string): EngineNodeData['fields'] {
  const spec = NODE_SPECS[kind];
  const fields: EngineNodeData['fields'] = {};
  // Inline literal fields plus unconnected input defaults are edited on the node.
  [...(spec.fields ?? []), ...spec.inputs].forEach((p) => {
    if (p.default !== undefined) fields[p.id] = p.default;
  });
  return fields;
}

let nid = 0;
export const nodeId = () => `n${nid++}_${Math.floor(performance.now() % 100000)}`;

export function makeNode(kind: string, position: { x: number; y: number }): Node<EngineNodeData> {
  return {
    id: nodeId(),
    type: 'engineNode',
    position,
    data: { kind, fields: defaultFields(kind) },
  };
}

/** A small demo graph: spin the object and log on start.
 *  In 2D, spin around Z (the screen-facing axis) so a flat shape stays visible. */
export function starterGraph(mode: GameMode = '3d'): ScriptGraph {
  const start = makeNode('event/start', { x: 40, y: 40 });
  const log = makeNode('action/log', { x: 320, y: 40 });
  log.data.fields.msg = 'Entity spawned';
  const update = makeNode('event/update', { x: 40, y: 220 });
  const rotate = makeNode('action/rotate', { x: 320, y: 220 });
  rotate.data.fields.by = mode === '2d' ? { x: 0, y: 0, z: 60 } : { x: 0, y: 60, z: 0 };
  rotate.data.fields.perSecond = true;

  const nodes: Node[] = [start, log, update, rotate];
  const edges: Edge[] = [
    { id: 'e1', source: start.id, sourceHandle: 'exec-out', target: log.id, targetHandle: 'exec-in' },
    { id: 'e2', source: update.id, sourceHandle: 'exec-out', target: rotate.id, targetHandle: 'exec-in' },
  ];
  return { nodes, edges };
}
