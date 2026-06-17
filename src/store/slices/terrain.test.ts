import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '../editorStore';

const s = () => useEditorStore.getState();

beforeEach(() => {
  useEditorStore.setState({ mode: '3d', entities: [], past: [], future: [], sceneRevision: 0 });
});

describe('addTerrain', () => {
  it('creates a selected terrain entity with default config', () => {
    const id = s().addTerrain();
    const e = s().entities.find((x) => x.id === id)!;
    expect(e.mesh).toMatchObject({ kind: 'terrain', visible: true });
    expect(e.mesh!.terrain).toMatchObject({ size: 40, subdivisions: 64, maxHeight: 8, heights: [] });
    expect(s().selectedId).toBe(id);
  });
});

describe('updateTerrain', () => {
  it('merges a patch and bumps sceneRevision', () => {
    const id = s().addTerrain();
    const before = s().sceneRevision;
    s().updateTerrain(id, { maxHeight: 20, heights: [0, 0.5, 1] });
    const t = s().entities.find((x) => x.id === id)!.mesh!.terrain!;
    expect(t.maxHeight).toBe(20);
    expect(t.heights).toEqual([0, 0.5, 1]);
    expect(s().sceneRevision).toBeGreaterThan(before);
  });

  it('seeds defaults when the entity had no terrain block yet', () => {
    // A plain box, then forced terrain patch — base falls back to defaultTerrain.
    const id = s().addPrimitive('box');
    s().updateTerrain(id, { subdivisions: 32 });
    const t = s().entities.find((x) => x.id === id)!.mesh!.terrain!;
    expect(t.subdivisions).toBe(32);
    expect(t.size).toBe(40); // default carried through
  });
});
