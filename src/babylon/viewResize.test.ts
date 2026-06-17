import { describe, it, expect } from 'vitest';
import { hardwareScalingLevelFor } from './viewResize';

describe('hardwareScalingLevelFor', () => {
  it('is 1 on a standard (non-HiDPI) display', () => {
    expect(hardwareScalingLevelFor(1)).toBe(1);
  });

  it('is 1/dpr on a Retina display (renders at native resolution)', () => {
    expect(hardwareScalingLevelFor(2)).toBe(0.5);
  });

  it('caps the ratio at 2× by default so 3× panels do not render oversized', () => {
    expect(hardwareScalingLevelFor(3)).toBe(0.5);
  });

  it('treats a missing/zero or sub-1 ratio as 1×', () => {
    expect(hardwareScalingLevelFor(0)).toBe(1);
    expect(hardwareScalingLevelFor(0.5)).toBe(1);
  });
});
