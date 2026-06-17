import { describe, it, expect } from 'vitest';
import type { ScriptGraph } from '@/types';
import { generateCode } from './codegen';

// Minimal graph: an "On Key Down" event whose exec output drives a Log node.
// Mirrors the user's graph (Key Down → Branch → Log), but event-driven.
function keyDownToLog(key: string, msg = 'Space Bar Pressed'): ScriptGraph {
  return {
    nodes: [
      { id: 'kd', type: 'engineNode', position: { x: 0, y: 0 }, data: { kind: 'event/keyDown', fields: { key } } },
      { id: 'log', type: 'engineNode', position: { x: 200, y: 0 }, data: { kind: 'action/log', fields: { msg } } },
    ],
    edges: [{ id: 'e1', source: 'kd', sourceHandle: 'exec-out', target: 'log', targetHandle: 'exec-in' }],
  } as unknown as ScriptGraph;
}

describe('codegen — On Key Down event node', () => {
  it('emits an edge-triggered handler into onUpdate that polls the chosen key', () => {
    const code = generateCode(keyDownToLog('space'));
    expect(code).toContain('function onUpdate(dt)');
    expect(code).toContain('const _kd = input.key("space")');
    // Fires only on the up→down transition (held last frame ⇒ skip).
    expect(code).toContain('if (_kd && !entity.props["__kd_kd"])');
    // Remembers this frame's state for the next edge check.
    expect(code).toContain('entity.props["__kd_kd"] = _kd');
  });

  it('runs the downstream exec chain inside the press guard', () => {
    const code = generateCode(keyDownToLog('space'));
    expect(code).toContain('console.log("Space Bar Pressed")');
    // The log must be inside the `if (_kd && …)` block, before the state write-back.
    const guard = code.indexOf('if (_kd');
    const log = code.indexOf('console.log("Space Bar Pressed")');
    const writeback = code.indexOf('entity.props["__kd_kd"] = _kd');
    expect(guard).toBeLessThan(log);
    expect(log).toBeLessThan(writeback);
  });

  it('passes the configured key through verbatim', () => {
    expect(generateCode(keyDownToLog('arrowup'))).toContain('input.key("arrowup")');
  });

  it('keys per-node state so two On Key Down nodes do not collide', () => {
    const graph = keyDownToLog('space');
    graph.nodes.push({
      id: 'kd2', type: 'engineNode', position: { x: 0, y: 200 },
      data: { kind: 'event/keyDown', fields: { key: 'e' } },
    } as unknown as ScriptGraph['nodes'][number]);
    const code = generateCode(graph);
    expect(code).toContain('entity.props["__kd_kd"]');
    expect(code).toContain('entity.props["__kd_kd2"]');
  });
});
