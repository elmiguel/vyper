import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '../editorStore';

beforeEach(() => useEditorStore.setState({ snapToGrid: false }));

describe('toggleSnapToGrid', () => {
  it('defaults to off', () => {
    expect(useEditorStore.getState().snapToGrid).toBe(false);
  });

  it('flips grid snapping on and off', () => {
    const s = () => useEditorStore.getState();
    s().toggleSnapToGrid();
    expect(s().snapToGrid).toBe(true);
    s().toggleSnapToGrid();
    expect(s().snapToGrid).toBe(false);
  });
});
