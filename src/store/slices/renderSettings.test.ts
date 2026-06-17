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
});
