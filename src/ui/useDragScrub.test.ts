import { describe, it, expect } from 'vitest';
import { computeScrubValue, scrubMultiplier } from './useDragScrub';

describe('computeScrubValue', () => {
  it('increases when dragging right and decreases when dragging left', () => {
    expect(computeScrubValue(0, 10, 0, 1, 1)).toBe(10);
    expect(computeScrubValue(0, -10, 0, 1, 1)).toBe(-10);
  });

  it('increases when dragging up and decreases when dragging down', () => {
    // screen-y grows downward, so up is a negative dy
    expect(computeScrubValue(0, 0, -10, 1, 1)).toBe(10);
    expect(computeScrubValue(0, 0, 10, 1, 1)).toBe(-10);
  });

  it('combines both axes so up-and-right adds together', () => {
    // +5 right and +5 up (dy = -5) => 10 px of travel
    expect(computeScrubValue(0, 5, -5, 1, 1)).toBe(10);
  });

  it('scales the delta by the step (value-per-pixel)', () => {
    expect(computeScrubValue(0, 20, 0, 0.1, 1)).toBe(2);
    expect(computeScrubValue(0, 4, 0, 5, 1)).toBe(20);
  });

  it('applies the modifier multiplier', () => {
    expect(computeScrubValue(0, 10, 0, 0.1, 10)).toBe(10); // shift = coarse
    expect(computeScrubValue(0, 10, 0, 0.1, 0.1)).toBe(0.1); // alt = fine
  });

  it('anchors the result to the base value captured at drag start', () => {
    expect(computeScrubValue(3.5, 10, 0, 0.1, 1)).toBe(4.5);
  });

  it('strips binary-float dust', () => {
    expect(computeScrubValue(0.1, 2, 0, 0.1, 1)).toBe(0.3);
  });

  it('clamps to min and max when provided', () => {
    expect(computeScrubValue(0, -100, 0, 1, 1, 0, 1)).toBe(0);
    expect(computeScrubValue(0, 100, 0, 1, 1, 0, 1)).toBe(1);
  });
});

describe('scrubMultiplier', () => {
  it('returns 10 (coarse) when Shift is held', () => {
    expect(scrubMultiplier({ shiftKey: true, altKey: false })).toBe(10);
  });
  it('returns 0.1 (fine) when Alt is held', () => {
    expect(scrubMultiplier({ shiftKey: false, altKey: true })).toBe(0.1);
  });
  it('prefers Shift over Alt when both are held', () => {
    expect(scrubMultiplier({ shiftKey: true, altKey: true })).toBe(10);
  });
  it('returns 1 with no modifiers', () => {
    expect(scrubMultiplier({ shiftKey: false, altKey: false })).toBe(1);
  });
});
