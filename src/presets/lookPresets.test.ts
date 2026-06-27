import { describe, it, expect } from 'vitest';
import { defaultRenderSettings, type RenderSettings } from '@/types';
import { LOOK_PRESETS, lookPresetIds } from './lookPresets';

describe('LOOK_PRESETS', () => {
  it('every preset key matches its id', () => {
    for (const [key, preset] of Object.entries(LOOK_PRESETS)) {
      expect(preset.id).toBe(key);
    }
  });

  it('lookPresetIds returns every preset id', () => {
    expect(lookPresetIds().sort()).toEqual(Object.keys(LOOK_PRESETS).sort());
  });

  it('ships the flagship Hyperreal Dreamscape preset', () => {
    expect(LOOK_PRESETS.hyperrealDreamscape).toBeTruthy();
    const cfg = LOOK_PRESETS.hyperrealDreamscape.config;
    // It's the reel look: wide angle, saturated, god rays on.
    expect(cfg.fov).toBeGreaterThan(60);
    expect(cfg.saturation).toBeGreaterThan(0);
    expect(cfg.godRays).toBe(true);
  });

  it('each preset merges to a complete RenderSettings with in-range values', () => {
    const keys = Object.keys(defaultRenderSettings()) as (keyof RenderSettings)[];
    for (const preset of Object.values(LOOK_PRESETS)) {
      const merged = { ...defaultRenderSettings(), ...preset.config };
      // No field is left undefined (every preset is appliable as-is).
      for (const k of keys) {
        if (k === 'lookPreset') continue;
        expect(merged[k], `${preset.id}.${k}`).toBeDefined();
      }
      // Ranges that the UI / pipeline assume.
      expect(merged.saturation).toBeGreaterThanOrEqual(-100);
      expect(merged.saturation).toBeLessThanOrEqual(100);
      expect(merged.warmth).toBeGreaterThanOrEqual(-1);
      expect(merged.warmth).toBeLessThanOrEqual(1);
      expect(merged.fov).toBeGreaterThan(0);
      expect(merged.fov).toBeLessThan(180);
      expect(['low', 'medium', 'high']).toContain(merged.dofBlur);
      expect(['none', 'standard', 'aces']).toContain(merged.tone);
    }
  });
});
