import { describe, it, expect } from 'vitest';
import type { Node } from '@xyflow/react';
import { canConnect, portKind } from './connectionRules';

const node = (id: string, kind: string): Node =>
  ({ id, type: 'engineNode', position: { x: 0, y: 0 }, data: { kind, fields: {} } } as unknown as Node);

// A representative graph: a value "Key Down" (bool out), an "On Key Down" event
// (exec out), a Branch (exec in + bool "cond" in), and a Log (exec in).
const nodes = [
  node('key', 'value/key'),
  node('onkey', 'event/keyDown'),
  node('branch', 'action/branch'),
  node('log', 'action/log'),
  node('pos', 'value/position'), // vec3 out
  node('math', 'value/math'),    // number ins (a/b)
];

const conn = (source: string, sourceHandle: string, target: string, targetHandle: string) => ({
  source,
  sourceHandle,
  target,
  targetHandle,
});

describe('portKind — handle prefix stripping', () => {
  it('reads an OUTPUT kind correctly (regression: "out-" is 4 chars, not 3)', () => {
    // The bug: slice(3) turned "out-out" → "-out" and returned null.
    expect(portKind(nodes[0], 'out-out', 'out')).toBe('bool');
  });

  it('reads an INPUT kind correctly', () => {
    expect(portKind(nodes[2], 'in-cond', 'in')).toBe('any'); // Branch value accepts any kind
  });

  it('returns null for an unknown port', () => {
    expect(portKind(nodes[0], 'out-nope', 'out')).toBeNull();
  });
});

describe('canConnect', () => {
  it('connects a bool output to a bool input (Key Down → Branch condition)', () => {
    expect(canConnect(conn('key', 'out-out', 'branch', 'in-cond'), nodes)).toBe(true);
  });

  it("Branch's 'any' value input accepts any data kind (e.g. a vec3 position)", () => {
    expect(canConnect(conn('pos', 'out-out', 'branch', 'in-cond'), nodes)).toBe(true);
    expect(canConnect(conn('pos', 'out-out', 'branch', 'in-compare'), nodes)).toBe(true);
  });

  it('still rejects mismatched strict ports (vec3 → a number input)', () => {
    expect(canConnect(conn('pos', 'out-out', 'math', 'in-a'), nodes)).toBe(false);
  });

  it('connects exec → exec (On Key Down → Log)', () => {
    expect(canConnect(conn('onkey', 'exec-out', 'log', 'exec-in'), nodes)).toBe(true);
  });

  it('connects exec → exec (On Key Down → Branch)', () => {
    expect(canConnect(conn('onkey', 'exec-out', 'branch', 'exec-in'), nodes)).toBe(true);
  });

  it('rejects data → exec (bool output into an exec input)', () => {
    expect(canConnect(conn('key', 'out-out', 'branch', 'exec-in'), nodes)).toBe(false);
  });

  it('rejects exec → data (exec output into a data input)', () => {
    expect(canConnect(conn('onkey', 'exec-out', 'log', 'in-msg'), nodes)).toBe(false);
  });

  it('rejects self-loops and dangling handles', () => {
    expect(canConnect(conn('key', 'out-out', 'key', 'in-cond'), nodes)).toBe(false);
    expect(canConnect(conn('key', '', 'branch', 'in-cond'), nodes)).toBe(false);
  });
});
