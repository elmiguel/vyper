import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '../editorStore';

beforeEach(() => useEditorStore.setState({ showSurfaces: true }));

describe('toggleSurfaces', () => {
  it('defaults to on (surfaces shown in Edit Mode)', () => {
    expect(useEditorStore.getState().showSurfaces).toBe(true);
  });

  it('flips the surface-visibility toggle', () => {
    const s = () => useEditorStore.getState();
    s().toggleSurfaces();
    expect(s().showSurfaces).toBe(false);
    s().toggleSurfaces();
    expect(s().showSurfaces).toBe(true);
  });
});
