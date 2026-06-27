import { describe, it, expect, beforeEach } from 'vitest';
import { defaultEditorPrefs, loadEditorPrefs, saveEditorPrefs, mergeEditorPrefs } from './editorPrefs';

const STORAGE_KEY = 'vyper:editorPrefs';

beforeEach(() => {
  localStorage.clear();
});

describe('editorPrefs storage', () => {
  it('returns defaults when nothing is stored', () => {
    expect(loadEditorPrefs()).toEqual(defaultEditorPrefs());
  });

  it('defaults: outline-only gold selection, cyan camera helper', () => {
    const d = defaultEditorPrefs().selection;
    expect(d.innerGlow).toBe(false);
    expect(d.outlineColor).toBe('#ffcc44');
    expect(d.cameraColor).toBe('#22d3ee');
    expect(d.glow).toBe(1);
    expect(d.opacity).toBe(1);
  });

  it('defaults: grid is ±20 units, 1-unit cells, full opacity', () => {
    const g = defaultEditorPrefs().grid;
    expect(g.extent).toBe(20);
    expect(g.cellSize).toBe(1);
    expect(g.opacity).toBe(1);
    expect(g.color).toBe('#2e1f57');
  });

  it('mergeEditorPrefs back-fills both categories from base', () => {
    const merged = mergeEditorPrefs(defaultEditorPrefs(), { grid: { cellSize: 2 } as never });
    expect(merged.grid.cellSize).toBe(2); // provided value kept
    expect(merged.grid.extent).toBe(20); // missing grid key back-filled
    expect(merged.selection.outlineColor).toBe('#ffcc44'); // whole missing category back-filled
  });

  it('round-trips through save → load', () => {
    const prefs = defaultEditorPrefs();
    prefs.selection.innerGlow = true;
    prefs.selection.outlineColor = '#00ff00';
    saveEditorPrefs(prefs);
    expect(loadEditorPrefs()).toEqual(prefs);
  });

  it('back-fills missing keys from defaults (forward-compatible saves)', () => {
    // A save written before `glow`/`cameraColor` existed.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ selection: { innerGlow: true } }));
    const loaded = loadEditorPrefs();
    expect(loaded.selection.innerGlow).toBe(true); // saved value kept
    expect(loaded.selection.glow).toBe(1); // missing key back-filled
    expect(loaded.selection.opacity).toBe(1);
    expect(loaded.selection.cameraColor).toBe('#22d3ee');
  });

  it('falls back to defaults on corrupt JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json');
    expect(loadEditorPrefs()).toEqual(defaultEditorPrefs());
  });
});
