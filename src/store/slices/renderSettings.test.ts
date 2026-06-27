import { describe, it, expect, beforeEach } from 'vitest';
import { defaultRenderSettings, emptyDesign } from '@/types';
import { useEditorStore } from '../editorStore';

// The store is a singleton — reset the design doc between tests.
beforeEach(() => {
  useEditorStore.setState({ design: emptyDesign() });
});

describe('updateRenderSettings', () => {
  const s = () => useEditorStore.getState();

  it('emptyDesign ships full default render settings', () => {
    expect(emptyDesign().render).toEqual(defaultRenderSettings());
  });

  it('merges a partial patch over the current settings', () => {
    s().updateRenderSettings({ bloom: false, bloomIntensity: 0.8 });
    expect(s().design.render.bloom).toBe(false);
    expect(s().design.render.bloomIntensity).toBe(0.8);
    // Untouched fields keep their defaults.
    expect(s().design.render.tone).toBe('aces');
    expect(s().design.render.shadows).toBe(true);
  });

  it('produces a fresh object reference each edit (so the engine re-applies)', () => {
    const before = s().design.render;
    s().updateRenderSettings({ exposure: 1.5 });
    expect(s().design.render).not.toBe(before);
    expect(s().design.render.exposure).toBe(1.5);
  });

  it('back-fills defaults when patching a design that has no render block (legacy state)', () => {
    // Simulate a hydrated design saved before render settings existed.
    useEditorStore.setState({ design: { ...emptyDesign(), render: undefined as never } });
    s().updateRenderSettings({ ssao: true });
    expect(s().design.render.ssao).toBe(true);
    // The rest of the defaults were filled in, not left undefined.
    expect(s().design.render.tone).toBe('aces');
  });

  it('a manual patch clears the active look preset (look becomes "Custom")', () => {
    s().applyLookPreset('hyperrealDreamscape');
    expect(s().design.render.lookPreset).toBe('hyperrealDreamscape');
    s().updateRenderSettings({ exposure: 2 });
    expect(s().design.render.lookPreset).toBeUndefined();
  });
});

describe('applyLookPreset', () => {
  const s = () => useEditorStore.getState();

  it('applies the preset config and records it as the active look', () => {
    s().applyLookPreset('hyperrealDreamscape');
    expect(s().design.render.lookPreset).toBe('hyperrealDreamscape');
    expect(s().design.render.godRays).toBe(true);
    expect(s().design.render.fov).toBeGreaterThan(60);
    // Fields the preset doesn't set still come from defaults.
    expect(s().design.render.shadows).toBe(defaultRenderSettings().shadows);
  });

  it('ignores an unknown preset id', () => {
    const before = s().design.render;
    s().applyLookPreset('does-not-exist');
    expect(s().design.render).toBe(before);
  });

  it('is authoritative: turns OFF effects the preset omits (e.g. SSAO grain source)', () => {
    // User had SSAO on; Hyperreal does not ask for it → it must be reset to off,
    // not carried over (this was the "grainy preset" bug).
    s().updateRenderSettings({ ssao: true, ssaoIntensity: 1.5 });
    expect(s().design.render.ssao).toBe(true);
    s().applyLookPreset('hyperrealDreamscape');
    expect(s().design.render.ssao).toBe(false);
  });

  it('preserves the scene environment when applying a look', () => {
    s().updateRenderSettings({ environmentUrl: 'env://sky.env', environmentIntensity: 2 });
    s().applyLookPreset('cinematic');
    expect(s().design.render.environmentUrl).toBe('env://sky.env');
    expect(s().design.render.environmentIntensity).toBe(2);
  });
});
