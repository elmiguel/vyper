import { describe, it, expect } from 'vitest';
import type { Node } from '@xyflow/react';
import { rectFromPoints, rectsOverlap, nodeRect, resolveSelection, modeFromEvent } from './useMarqueeSelection';

const node = (id: string, x: number, y: number, w = 152, h = 40): Node =>
  ({ id, position: { x, y }, measured: { width: w, height: h }, data: {} }) as Node;

describe('rectFromPoints', () => {
  it('normalises corners regardless of drag direction', () => {
    expect(rectFromPoints(10, 20, 4, 50)).toEqual({ x: 4, y: 20, w: 6, h: 30 });
    expect(rectFromPoints(4, 50, 10, 20)).toEqual({ x: 4, y: 20, w: 6, h: 30 });
  });
});

describe('rectsOverlap', () => {
  const box = { x: 0, y: 0, w: 100, h: 100 };
  it('detects partial overlap', () => {
    expect(rectsOverlap(box, { x: 90, y: 90, w: 50, h: 50 })).toBe(true);
  });
  it('rejects disjoint rects', () => {
    expect(rectsOverlap(box, { x: 200, y: 0, w: 10, h: 10 })).toBe(false);
  });
  it('treats edge-only touching as non-overlap', () => {
    expect(rectsOverlap(box, { x: 100, y: 0, w: 10, h: 10 })).toBe(false);
  });
});

describe('nodeRect', () => {
  it('uses measured size when present', () => {
    expect(nodeRect(node('a', 5, 6, 120, 40))).toEqual({ x: 5, y: 6, w: 120, h: 40 });
  });
  it('falls back to a default size before measurement', () => {
    expect(nodeRect({ position: { x: 1, y: 2 } } as Node)).toEqual({ x: 1, y: 2, w: 152, h: 40 });
  });
});

describe('modeFromEvent', () => {
  it('maps modifiers to modes (Ctrl or Cmd → subtract, Shift → add)', () => {
    expect(modeFromEvent({ metaKey: false, ctrlKey: false, shiftKey: false })).toBe('replace');
    expect(modeFromEvent({ metaKey: false, ctrlKey: false, shiftKey: true })).toBe('add');
    expect(modeFromEvent({ metaKey: false, ctrlKey: true, shiftKey: false })).toBe('subtract');
    expect(modeFromEvent({ metaKey: true, ctrlKey: false, shiftKey: false })).toBe('subtract');
    // Subtract wins if both are somehow held.
    expect(modeFromEvent({ metaKey: false, ctrlKey: true, shiftKey: true })).toBe('subtract');
  });
});

describe('resolveSelection', () => {
  const snapshot = new Set(['a', 'b']);
  const inRect = new Set(['b', 'c']);
  it('replace → exactly the boxed nodes', () => {
    expect([...resolveSelection('replace', snapshot, inRect)].sort()).toEqual(['b', 'c']);
  });
  it('add → union of prior selection and boxed nodes', () => {
    expect([...resolveSelection('add', snapshot, inRect)].sort()).toEqual(['a', 'b', 'c']);
  });
  it('subtract → prior selection minus boxed nodes', () => {
    expect([...resolveSelection('subtract', snapshot, inRect)].sort()).toEqual(['a']);
  });
  it('subtract on empty box is a no-op', () => {
    expect([...resolveSelection('subtract', snapshot, new Set())].sort()).toEqual(['a', 'b']);
  });
});
