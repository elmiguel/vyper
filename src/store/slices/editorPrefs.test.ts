import { describe, it, expect, beforeEach } from 'vitest';
import { defaultEditorPrefs } from '../editorPrefs';
import { useEditorStore } from '../editorStore';

// The store is a singleton — reset prefs (and clear storage) between tests.
beforeEach(() => {
  localStorage.clear();
  useEditorStore.setState({ editorPrefs: defaultEditorPrefs() });
});

describe('updateSelectionPrefs', () => {
  const s = () => useEditorStore.getState();

  it('merges a partial patch over the current selection prefs', () => {
    s().updateSelectionPrefs({ innerGlow: true });
    expect(s().editorPrefs.selection.innerGlow).toBe(true);
    // Untouched fields keep their defaults.
    expect(s().editorPrefs.selection.outlineColor).toBe('#ffcc44');
  });

  it('produces a fresh prefs reference each edit (so the engine re-applies)', () => {
    const before = s().editorPrefs;
    s().updateSelectionPrefs({ glow: 2 });
    expect(s().editorPrefs).not.toBe(before);
  });

  it('persists the change to localStorage', () => {
    s().updateSelectionPrefs({ outlineColor: '#123456' });
    const raw = JSON.parse(localStorage.getItem('vyper:editorPrefs') as string);
    expect(raw.selection.outlineColor).toBe('#123456');
  });
});

describe('updateGridPrefs', () => {
  const s = () => useEditorStore.getState();

  it('merges a partial patch and persists it', () => {
    s().updateGridPrefs({ cellSize: 2, color: '#abcdef' });
    expect(s().editorPrefs.grid.cellSize).toBe(2);
    expect(s().editorPrefs.grid.color).toBe('#abcdef');
    expect(s().editorPrefs.grid.extent).toBe(20); // untouched
    const raw = JSON.parse(localStorage.getItem('vyper:editorPrefs') as string);
    expect(raw.grid.cellSize).toBe(2);
  });
});

describe('hydrateEditorPrefs', () => {
  const s = () => useEditorStore.getState();

  it('replaces prefs in the store without writing localStorage', () => {
    const next = { ...defaultEditorPrefs(), grid: { ...defaultEditorPrefs().grid, cellSize: 5 } };
    s().hydrateEditorPrefs(next);
    expect(s().editorPrefs.grid.cellSize).toBe(5);
    // Hydration is the per-project DB value — it must not clobber the cross-project default.
    expect(localStorage.getItem('vyper:editorPrefs')).toBeNull();
  });
});

describe('resetEditorPrefs', () => {
  const s = () => useEditorStore.getState();

  it('restores defaults and persists them', () => {
    s().updateSelectionPrefs({ innerGlow: true, glow: 3 });
    s().resetEditorPrefs();
    expect(s().editorPrefs).toEqual(defaultEditorPrefs());
    const raw = JSON.parse(localStorage.getItem('vyper:editorPrefs') as string);
    expect(raw).toEqual(defaultEditorPrefs());
  });
});
