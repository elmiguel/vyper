import { describe, it, expect, beforeEach } from 'vitest';
import type { Asset } from '@/types';
import { useEditorStore } from '../editorStore';

const chicken: Asset = { id: 'chicken_001', name: 'Chicken', type: 'model', source: 'builtin', format: 'obj', modelFile: 'chicken_001.obj', textures: [] };

beforeEach(() => {
  useEditorStore.setState({ entities: [], assetLibrary: { assets: [chicken] }, selectedId: null, past: [], future: [] });
});

describe('addModelEntity', () => {
  it('creates a model-kind entity referencing the asset, and selects it', () => {
    const id = useEditorStore.getState().addModelEntity('chicken_001');
    const e = useEditorStore.getState().entities.find((x) => x.id === id)!;
    expect(e.mesh).toMatchObject({ kind: 'model', assetId: 'chicken_001', visible: true });
    expect(e.name).toBe('Chicken'); // named after the asset
    expect(useEditorStore.getState().selectedId).toBe(id);
  });

  it('bumps sceneRevision so the viewport reconciles', () => {
    const before = useEditorStore.getState().sceneRevision;
    useEditorStore.getState().addModelEntity('chicken_001');
    expect(useEditorStore.getState().sceneRevision).toBe(before + 1);
  });

  it('falls back to a generic name for an unknown asset id', () => {
    const id = useEditorStore.getState().addModelEntity('nope');
    expect(useEditorStore.getState().entities.find((x) => x.id === id)!.name).toMatch(/^Model/);
  });
});
