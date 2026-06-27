import { describe, it, expect } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
import { defaultRenderSettings, type RenderSettings } from '@/types';
import { castsShadows, shadowParamsFrom, colorCurvesFrom, configureDefaultPipeline } from './RenderPipeline';

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

describe('configureDefaultPipeline', () => {
  const make = () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const cam = new FreeCamera('c', new Vector3(0, 0, -5), scene);
    const pipeline = new DefaultRenderingPipeline('t', true, scene, [cam]);
    return { engine, scene, pipeline };
  };

  // Regression: the chromatic-aberration / sharpen / DOF post-processes are null
  // while disabled, so their sub-properties must only be set when enabled — else
  // applying the DEFAULT settings (all three off) throws and blanks the viewport.
  it('does not throw when lens effects are disabled (the defaults)', () => {
    const { engine, scene, pipeline } = make();
    expect(() => configureDefaultPipeline(pipeline, defaultRenderSettings())).not.toThrow();
    scene.dispose();
    engine.dispose();
  });

  it('does not throw when lens effects are enabled', () => {
    const { engine, scene, pipeline } = make();
    const s: RenderSettings = { ...defaultRenderSettings(), chromaticAberration: true, sharpen: true, dof: true };
    expect(() => configureDefaultPipeline(pipeline, s)).not.toThrow();
    expect(pipeline.chromaticAberrationEnabled).toBe(true);
    expect(pipeline.depthOfFieldEnabled).toBe(true);
    scene.dispose();
    engine.dispose();
  });

  it('applies the colour grade after the chain toggles (not left enabled-but-unbound)', () => {
    const { engine, scene, pipeline } = make();
    // Lens toggles trigger pipeline rebuilds; the grade must survive them.
    configureDefaultPipeline(pipeline, { ...defaultRenderSettings(), saturation: 80, chromaticAberration: true, sharpen: true, dof: true });
    expect(pipeline.imageProcessing.colorCurvesEnabled).toBe(true);
    expect(pipeline.imageProcessing.colorCurves?.globalSaturation).toBe(80);
    scene.dispose();
    engine.dispose();
  });

  it('wires film-grain and vignette strength', () => {
    const { engine, scene, pipeline } = make();
    configureDefaultPipeline(pipeline, { ...defaultRenderSettings(), grain: true, grainIntensity: 22, vignette: true, vignetteWeight: 3 });
    expect(pipeline.grainEnabled).toBe(true);
    expect(pipeline.grain.intensity).toBe(22);
    expect(pipeline.imageProcessing.vignetteWeight).toBe(3);
    scene.dispose();
    engine.dispose();
  });
});

describe('colorCurvesFrom', () => {
  const s = (over: Partial<RenderSettings>): RenderSettings => ({ ...defaultRenderSettings(), ...over });

  it('passes global saturation through (clamped to ±100)', () => {
    expect(colorCurvesFrom(s({ saturation: 40 })).globalSaturation).toBe(40);
    expect(colorCurvesFrom(s({ saturation: 250 })).globalSaturation).toBe(100);
    expect(colorCurvesFrom(s({ saturation: -250 })).globalSaturation).toBe(-100);
  });

  it('leaves split-tone hues untouched at warmth 0', () => {
    const cc = colorCurvesFrom(s({ warmth: 0 }));
    expect(cc.highlightsSaturation).toBe(0);
    expect(cc.shadowsSaturation).toBe(0);
  });

  it('warm highlights + cool shadows when warmth is positive', () => {
    const cc = colorCurvesFrom(s({ warmth: 1 }));
    expect(cc.highlightsHue).toBeLessThan(90); // warm/orange
    expect(cc.shadowsHue).toBeGreaterThan(180); // cool/blue
    expect(cc.highlightsSaturation).toBeGreaterThan(0);
  });

  it('reverses the split when warmth is negative', () => {
    const cc = colorCurvesFrom(s({ warmth: -1 }));
    expect(cc.highlightsHue).toBeGreaterThan(180); // cool highlights
    expect(cc.shadowsHue).toBeLessThan(90); // warm shadows
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
