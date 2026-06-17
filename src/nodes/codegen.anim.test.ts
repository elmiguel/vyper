import { describe, it, expect } from 'vitest';
import type { ScriptGraph } from '@/types';
import { generateCode } from './codegen';

/** On Start → Play Animation(clip, loop) chained to Stop Animation. */
function startToAnim(clip: string, loop: boolean): ScriptGraph {
  return {
    nodes: [
      { id: 'st', type: 'engineNode', position: { x: 0, y: 0 }, data: { kind: 'event/start', fields: {} } },
      { id: 'play', type: 'engineNode', position: { x: 200, y: 0 }, data: { kind: 'world/playClip', fields: { clip, loop } } },
      { id: 'stop', type: 'engineNode', position: { x: 400, y: 0 }, data: { kind: 'world/stopClip', fields: {} } },
    ],
    edges: [
      { id: 'e1', source: 'st', sourceHandle: 'exec-out', target: 'play', targetHandle: 'exec-in' },
      { id: 'e2', source: 'play', sourceHandle: 'exec-out', target: 'stop', targetHandle: 'exec-in' },
    ],
  } as unknown as ScriptGraph;
}

describe('codegen — skeletal animation nodes', () => {
  it('emits entity.playClip with the clip name and loop flag', () => {
    const code = generateCode(startToAnim('Walk', true));
    expect(code).toContain('entity.playClip("Walk", true)');
  });

  it('passes loop=false through', () => {
    expect(generateCode(startToAnim('Wave', false))).toContain('entity.playClip("Wave", false)');
  });

  it('chains the Stop Animation node after Play', () => {
    const code = generateCode(startToAnim('Walk', true));
    expect(code).toContain('entity.stopClip()');
    expect(code.indexOf('entity.playClip')).toBeLessThan(code.indexOf('entity.stopClip()'));
  });
});
