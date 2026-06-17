import { describe, it, expect } from 'vitest';
import { clamp01, slideRatio, lineAngle, nearestAngleIndex } from './loopCutDrag';

describe('loopCutDrag — slide ratio', () => {
  it('projects the cursor onto the segment and clamps to [0,1]', () => {
    // Horizontal segment from (0,0) to (10,0).
    expect(slideRatio(5, 0, 0, 0, 10, 0)).toBeCloseTo(0.5);
    expect(slideRatio(2, 3, 0, 0, 10, 0)).toBeCloseTo(0.2); // off-axis projects onto the line
    expect(slideRatio(-5, 0, 0, 0, 10, 0)).toBe(0); // before the start clamps
    expect(slideRatio(99, 0, 0, 0, 10, 0)).toBe(1); // past the end clamps
  });

  it('returns the midpoint for a degenerate (zero-length) segment', () => {
    expect(slideRatio(3, 3, 5, 5, 5, 5)).toBe(0.5);
  });

  it('clamp01 bounds its input', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(0.3)).toBe(0.3);
  });
});

describe('loopCutDrag — angular loop selection', () => {
  it('folds vectors to an undirected line angle in [0,π)', () => {
    expect(lineAngle(1, 0)).toBeCloseTo(0);
    expect(lineAngle(-1, 0)).toBeCloseTo(0); // opposite direction → same line
    expect(lineAngle(0, 1)).toBeCloseTo(Math.PI / 2);
    expect(lineAngle(0, -1)).toBeCloseTo(Math.PI / 2);
  });

  it('picks the candidate whose line angle is closest (mod π) to the drag', () => {
    const angles = [0, Math.PI / 2]; // a horizontal and a vertical loop
    expect(nearestAngleIndex(angles, 0.1)).toBe(0); // nearly horizontal drag → horizontal loop
    expect(nearestAngleIndex(angles, Math.PI / 2 - 0.1)).toBe(1); // nearly vertical → vertical loop
    expect(nearestAngleIndex(angles, Math.PI - 0.05)).toBe(0); // wraps mod π back to horizontal
  });

  it('returns -1 when there are no candidates', () => {
    expect(nearestAngleIndex([], 1)).toBe(-1);
  });
});
