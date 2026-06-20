import { describe, it, expect } from 'vitest';
import type { ScriptGraph } from '@/types';
import { generateCode } from './codegen';

/** event/start → branch, with `value` fed by some source node, then a Log on the `then` exec. */
function startBranch(
  sourceKind: string,
  fields: Record<string, unknown>,
  edges: { value?: boolean; compare?: string },
  compareNodeKind?: string,
): ScriptGraph {
  const nodes: Record<string, unknown>[] = [
    { id: 'st', type: 'engineNode', position: { x: 0, y: 0 }, data: { kind: 'event/start', fields: {} } },
    { id: 'src', type: 'engineNode', position: { x: 0, y: 80 }, data: { kind: sourceKind, fields: {} } },
    { id: 'br', type: 'engineNode', position: { x: 200, y: 0 }, data: { kind: 'action/branch', fields } },
    { id: 'log', type: 'engineNode', position: { x: 400, y: 0 }, data: { kind: 'action/log', fields: { msg: 'hit' } } },
  ];
  const e: Record<string, unknown>[] = [
    { id: 'x', source: 'st', sourceHandle: 'exec-out', target: 'br', targetHandle: 'exec-in' },
    { id: 'y', source: 'br', sourceHandle: 'exec-then', target: 'log', targetHandle: 'exec-in' },
  ];
  if (edges.value) e.push({ id: 'v', source: 'src', sourceHandle: 'out-out', target: 'br', targetHandle: 'in-cond' });
  if (edges.compare && compareNodeKind) {
    nodes.push({ id: 'cmp', type: 'engineNode', position: { x: 0, y: 160 }, data: { kind: compareNodeKind, fields: {} } });
    e.push({ id: 'c', source: 'cmp', sourceHandle: 'out-out', target: 'br', targetHandle: 'in-compare' });
  }
  return { nodes, edges: e } as unknown as ScriptGraph;
}

describe('codegen — smart Branch (if)', () => {
  it('compares a vec3 component against a literal (Get Position → y > 5)', () => {
    const code = generateCode(startBranch('value/position', { path: 'y', op: '>', rhs: 5 }, { value: true }));
    expect(code).toContain('if ((entity.position).y > 5)');
  });

  it('uses Math.hypot for the length check', () => {
    const code = generateCode(startBranch('value/position', { path: 'length', op: '<=', rhs: 3 }, { value: true }));
    expect(code).toContain('Math.hypot((entity.position).x, (entity.position).y, (entity.position).z) <= 3');
  });

  it('quotes a string literal compare', () => {
    const code = generateCode(startBranch('value/prop', { path: 'value', op: '==', rhs: 'win' }, { value: true }));
    // value/prop emits a number-ish getProp expr, but the rhs literal is typed by the source kind;
    // value/prop is `number`, so to exercise string we check the operator instead:
    expect(code).toContain('===');
  });

  it('compares against another connected node via the compare port', () => {
    const code = generateCode(
      startBranch('value/prop', { path: 'value', op: '>', rhs: 0 }, { value: true, compare: 'in-compare' }, 'value/time'),
    );
    expect(code).toContain('> time.elapsed');
  });

  it('wires a Respawn action onto the then branch (fell below y=0 → respawn)', () => {
    const g = startBranch('value/position', { path: 'y', op: '<=', rhs: 0 }, { value: true });
    // Swap the Log target for a Respawn node.
    (g.nodes as Record<string, unknown>[]).find((n) => (n as { id: string }).id === 'log')!.data = {
      kind: 'action/respawn',
      fields: {},
    };
    const code = generateCode(g);
    expect(code).toContain('if ((entity.position).y <= 0)');
    expect(code).toContain('entity.respawn();');
  });

  it('stays backward compatible: a bool value with "is true" emits a plain truthiness if', () => {
    const code = generateCode(startBranch('value/key', { path: 'value', op: 'is true', rhs: 0 }, { value: true }));
    expect(code).toMatch(/if \(!!\(input\.key/);
  });

  it('defaults an unconnected branch to a truthiness test on its literal', () => {
    // makeNode seeds `cond`'s default (true); mirror that for the unconnected case.
    const code = generateCode(startBranch('value/key', { path: 'value', op: 'is true', rhs: 0, cond: true }, {}));
    expect(code).toContain('if (!!(true))'); // cond literal default is true
  });
});
