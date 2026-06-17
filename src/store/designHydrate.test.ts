import { describe, it, expect } from 'vitest';
import { defaultRenderSettings } from '@/types';
import { designOf } from './projectStore';

describe('designOf — render backfill', () => {
  it('back-fills render fields missing from an older saved design (no undefined)', () => {
    // A design saved before shadow controls existed: render lacks the new fields.
    const settings = {
      design: { pitch: 'old game', render: { enabled: true, shadows: true, shadowQuality: 1024 } },
    };
    const design = designOf(settings);
    const d = defaultRenderSettings();
    expect(design.render.shadowSoftness).toBe(d.shadowSoftness);
    expect(design.render.shadowDarkness).toBe(d.shadowDarkness);
    expect(design.render.shadowBias).toBe(d.shadowBias);
    expect(design.render.shadowType).toBe(d.shadowType);
    // Saved values are preserved over the defaults.
    expect(design.render.shadows).toBe(true);
    expect(design.pitch).toBe('old game');
  });

  it('returns full defaults when there is no design at all', () => {
    expect(designOf(undefined).render).toEqual(defaultRenderSettings());
    expect(designOf({}).render).toEqual(defaultRenderSettings());
  });
});
