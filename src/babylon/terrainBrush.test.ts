import { describe, it, expect } from 'vitest';
import { applyBrush, falloff, flatHeights, gridSize, hitToGrid, resolveBrushMode } from './terrainBrush';

describe('resolveBrushMode (sculpt modifier keys)', () => {
  const none = { ctrl: false, shift: false, invert: false };
  it('plain drag uses the selected brush mode (raise = positive by default)', () => {
    expect(resolveBrushMode('raise', none)).toBe('raise');
    expect(resolveBrushMode('lower', none)).toBe('lower');
  });
  it('Ctrl flattens, regardless of selected mode', () => {
    expect(resolveBrushMode('raise', { ...none, ctrl: true })).toBe('flatten');
    expect(resolveBrushMode('lower', { ...none, ctrl: true })).toBe('flatten');
  });
  it('Shift smooths', () => {
    expect(resolveBrushMode('raise', { ...none, shift: true })).toBe('smooth');
  });
  it('Cmd/Alt (invert) digs — lowers (negative)', () => {
    expect(resolveBrushMode('raise', { ...none, invert: true })).toBe('lower');
  });
  it('precedence: Ctrl (flatten) > Shift (smooth) > invert (lower)', () => {
    expect(resolveBrushMode('raise', { ctrl: true, shift: true, invert: true })).toBe('flatten');
    expect(resolveBrushMode('raise', { ctrl: false, shift: true, invert: true })).toBe('smooth');
  });
});

describe('grid helpers', () => {
  it('gridSize = subdivisions + 1; flatHeights is all zeros of n²', () => {
    expect(gridSize(4)).toBe(5);
    const h = flatHeights(4);
    expect(h).toHaveLength(25);
    expect(h.every((v) => v === 0)).toBe(true);
  });

  it('falloff is 1 at center, 0 at/after the radius', () => {
    expect(falloff(0, 4)).toBe(1);
    expect(falloff(4, 4)).toBe(0);
    expect(falloff(5, 4)).toBe(0);
    expect(falloff(2, 4)).toBeGreaterThan(0);
  });

  it('maps a centered hit to the middle of the grid', () => {
    const { gx, gz } = hitToGrid(0, 0, 40, 5); // size 40, n 5 → center index 2
    expect(gx).toBeCloseTo(2);
    expect(gz).toBeCloseTo(2);
  });
});

describe('applyBrush', () => {
  const sub = 8; // 9×9 grid
  const size = 8; // 1 unit spacing
  const n = gridSize(sub);
  const centerIdx = Math.floor(n / 2) * n + Math.floor(n / 2);

  it('does not mutate the input array', () => {
    const before = flatHeights(sub);
    const after = applyBrush(before, sub, size, 0, 0, { radius: 2, strength: 0.5, mode: 'raise' });
    expect(before.every((v) => v === 0)).toBe(true);
    expect(after).not.toBe(before);
  });

  it('raise lifts the center most, tapering with distance, clamped to 1', () => {
    const out = applyBrush(flatHeights(sub), sub, size, 0, 0, { radius: 3, strength: 0.4, mode: 'raise' });
    expect(out[centerIdx]).toBeGreaterThan(0);
    expect(out[centerIdx]).toBeLessThanOrEqual(1);
    // A vertex one cell from center is raised less than the center.
    expect(out[centerIdx + 1]).toBeLessThan(out[centerIdx]);
    // Far outside the radius is untouched.
    expect(out[0]).toBe(0);
  });

  it('lower clamps at 0 and never goes negative', () => {
    const out = applyBrush(flatHeights(sub), sub, size, 0, 0, { radius: 3, strength: 0.5, mode: 'lower' });
    expect(out.every((v) => v >= 0)).toBe(true);
  });

  it('flatten pulls toward the center height', () => {
    const heights = flatHeights(sub);
    heights[centerIdx] = 0.5; // a plateau value at center
    const out = applyBrush(heights, sub, size, 0, 0, { radius: 3, strength: 1, mode: 'flatten' });
    // A neighbour moves toward the center's 0.5.
    expect(out[centerIdx + 1]).toBeGreaterThan(0);
    expect(out[centerIdx + 1]).toBeLessThanOrEqual(0.5);
  });

  it('smooth averages a spike toward its neighbours', () => {
    const heights = flatHeights(sub);
    heights[centerIdx] = 1; // sharp spike
    const out = applyBrush(heights, sub, size, 0, 0, { radius: 3, strength: 1, mode: 'smooth' });
    expect(out[centerIdx]).toBeLessThan(1); // spike pulled down toward 0 neighbours
  });
});
