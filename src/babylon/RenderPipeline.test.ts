import { describe, it, expect } from 'vitest';
import { defaultRenderSettings, type RenderSettings } from '@/types';
import { castsShadows, shadowParamsFrom } from './RenderPipeline';

describe('castsShadows', () => {
  it('directional, point and spot lights cast shadows', () => {
    expect(castsShadows('DirectionalLight')).toBe(true);
    expect(castsShadows('PointLight')).toBe(true);
    expect(castsShadows('SpotLight')).toBe(true);
  });

  it('hemispheric lights and unknowns do not', () => {
    expect(castsShadows('HemisphericLight')).toBe(false);
    expect(castsShadows(undefined)).toBe(false);
    expect(castsShadows('Light')).toBe(false);
  });
});

describe('shadowParamsFrom', () => {
  const s = (over: Partial<RenderSettings>): RenderSettings => ({ ...defaultRenderSettings(), ...over });

  it('maps the edge type to a filter strategy', () => {
    expect(shadowParamsFrom(s({ shadowType: 'hard' })).filter).toBe('none');
    expect(shadowParamsFrom(s({ shadowType: 'soft' })).filter).toBe('pcf');
    expect(shadowParamsFrom(s({ shadowType: 'contact' })).filter).toBe('pcss');
  });

  it('maps softness to sample quality bands', () => {
    expect(shadowParamsFrom(s({ shadowSoftness: 0.1 })).quality).toBe('low');
    expect(shadowParamsFrom(s({ shadowSoftness: 0.5 })).quality).toBe('medium');
    expect(shadowParamsFrom(s({ shadowSoftness: 0.9 })).quality).toBe('high');
  });

  it('widens the contact-hardening penumbra with softness', () => {
    const sharp = shadowParamsFrom(s({ shadowSoftness: 0 })).lightSizeUVRatio;
    const smooth = shadowParamsFrom(s({ shadowSoftness: 1 })).lightSizeUVRatio;
    expect(smooth).toBeGreaterThan(sharp);
  });

  it('inverts darkness for Babylon (1 = fully dark → setDarkness 0)', () => {
    expect(shadowParamsFrom(s({ shadowDarkness: 1 })).darkness).toBe(0);
    expect(shadowParamsFrom(s({ shadowDarkness: 0 })).darkness).toBe(1);
  });

  it('passes bias values through', () => {
    const p = shadowParamsFrom(s({ shadowBias: 0.002, shadowNormalBias: 0.05 }));
    expect(p.bias).toBe(0.002);
    expect(p.normalBias).toBe(0.05);
  });
});
