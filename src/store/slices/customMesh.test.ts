import { describe, it, expect, beforeEach } from 'vitest';
import type { CustomGeometry } from '@/types';
import { useEditorStore } from '../editorStore';

const s = () => useEditorStore.getState();
const geo: CustomGeometry = { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2], normals: [] };

beforeEach(() => {
  useEditorStore.setState({ entities: [], past: [], future: [], sceneRevision: 0 });
});

describe('addCustomMesh', () => {
  it('adds a selected custom-mesh entity carrying the baked geometry', () => {
    const before = s().sceneRevision;
    const id = s().addCustomMesh(geo, 'subtract of Box');
    const e = s().entities.find((x) => x.id === id)!;
    expect(e.mesh).toMatchObject({ kind: 'custom', visible: true });
    expect(e.mesh!.custom).toBe(geo);
    expect(e.name).toBe('subtract of Box');
    expect(s().selectedId).toBe(id);
    expect(s().sceneRevision).toBeGreaterThan(before);
  });
});
