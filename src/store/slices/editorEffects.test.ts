import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '../editorStore';

beforeEach(() => useEditorStore.setState({ editorEffects: true }));

describe('toggleEditorEffects', () => {
  it('defaults to on (effects rendering)', () => {
    expect(useEditorStore.getState().editorEffects).toBe(true);
  });

  it('flips the editor camera-effects toggle', () => {
    const s = () => useEditorStore.getState();
    s().toggleEditorEffects();
    expect(s().editorEffects).toBe(false);
    s().toggleEditorEffects();
    expect(s().editorEffects).toBe(true);
  });
});
