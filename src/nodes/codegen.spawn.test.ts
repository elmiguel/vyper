import { describe, it, expect } from 'vitest';
import type { ScriptGraph } from '@/types';
import { generateCode } from './codegen';

/** start → <action>, with an Object("name") value node feeding the action's entity input. */
function startToWorldAction(kind: 'world/spawn' | 'world/despawn', inputId: string, name: string): ScriptGraph {
  return {
    nodes: [
      { id: 'st', type: 'engineNode', position: { x: 0, y: 0 }, data: { kind: 'event/start', fields: {} } },
      { id: 'obj', type: 'engineNode', position: { x: 0, y: 100 }, data: { kind: 'value/object', fields: { name } } },
      { id: 'act', type: 'engineNode', position: { x: 200, y: 0 }, data: { kind, fields: {} } },
    ],
    edges: [
      { id: 'e1', source: 'st', sourceHandle: 'exec-out', target: 'act', targetHandle: 'exec-in' },
      { id: 'e2', source: 'obj', sourceHandle: 'out-out', target: 'act', targetHandle: `in-${inputId}` },
    ],
  } as unknown as ScriptGraph;
}

describe('codegen — spawn / despawn world actions', () => {
  it('emits world.spawn with the resolved spawner', () => {
    const code = generateCode(startToWorldAction('world/spawn', 'spawner', 'Goblins'));
    expect(code).toContain('world.spawn(world.findObject("Goblins"))');
  });

  it('emits world.despawn with the resolved instance', () => {
    const code = generateCode(startToWorldAction('world/despawn', 'target', 'Goblins'));
    expect(code).toContain('world.despawn(world.findObject("Goblins"))');
  });
});
