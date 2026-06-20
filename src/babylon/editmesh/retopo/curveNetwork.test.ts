import { describe, it, expect } from 'vitest';
import type { V3 } from '@/kernel/HalfEdgeMesh';
import { CurveNetwork } from './curveNetwork';

const seg = (a: V3, b: V3): V3[] => [a, b];

describe('CurveNetwork — snapping', () => {
  it('merges endpoints within the threshold into one node', () => {
    const net = new CurveNetwork(0.1);
    net.addCurve(seg([0, 0, 0], [1, 0, 0]));
    net.addCurve(seg([1.02, 0, 0], [2, 0, 0])); // start ~ node at (1,0,0)
    expect(net.nodes).toHaveLength(3); // not 4 — the shared end merged
  });
});

describe('CurveNetwork — 4-cycle detection', () => {
  it('reports exactly one quad when four curves close a square', () => {
    const net = new CurveNetwork(0.1);
    expect(net.addCurve(seg([0, 0, 0], [1, 0, 0]))).toEqual([]);
    expect(net.addCurve(seg([1, 0, 0], [1, 1, 0]))).toEqual([]);
    expect(net.addCurve(seg([1, 1, 0], [0, 1, 0]))).toEqual([]);
    const cycles = net.addCurve(seg([0, 1, 0], [0, 0, 0])); // closes the loop
    expect(cycles).toHaveLength(1);
    expect(net.nodes).toHaveLength(4);
    // The loop's consecutive nodes are all edge-adjacent (a real boundary).
    const loop = cycles[0];
    for (let i = 0; i < 4; i++) {
      expect(net.curveBetween(loop[i], loop[(i + 1) % 4])).not.toBeNull();
    }
  });

  it('does not re-fill an already-filled patch', () => {
    const net = new CurveNetwork(0.1);
    net.addCurve(seg([0, 0, 0], [1, 0, 0]));
    net.addCurve(seg([1, 0, 0], [1, 1, 0]));
    net.addCurve(seg([1, 1, 0], [0, 1, 0]));
    net.addCurve(seg([0, 1, 0], [0, 0, 0]));
    // A redundant diagonal shouldn't re-report the square.
    const more = net.addCurve(seg([0, 0, 0], [1, 1, 0]));
    expect(more.every((c) => c.length === 4)).toBe(true);
    // The original square cycle must not appear twice.
    const square = [0, 1, 2, 3].join(',');
    const keys = more.map((c) => [...c].sort((a, b) => a - b).join(','));
    expect(keys).not.toContain(square);
  });
});

describe('CurveNetwork — T-junction split', () => {
  it('splits a crossed curve and inserts a node at the hit', () => {
    const net = new CurveNetwork(0.1);
    net.addCurve([[0, 0, 0], [0.5, 0, 0], [1, 0, 0]]); // bottom edge with an interior sample
    expect(net.nodes).toHaveLength(2);
    net.addCurve(seg([0.5, 0, 0], [0.5, 0.5, 0])); // starts on the bottom edge's interior
    // Split node at (0.5,0,0) + far endpoint (0.5,0.5,0) = 4 nodes; bottom split into 2 curves + 1 new = 3.
    expect(net.nodes).toHaveLength(4);
    expect(net.curves).toHaveLength(3);
  });
});
