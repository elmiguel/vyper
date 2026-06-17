import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '../editorStore';

const s = () => useEditorStore.getState();

beforeEach(() => {
  useEditorStore.setState({ entities: [], past: [], future: [], sceneRevision: 0 });
});

describe('updateMaterial', () => {
  it('seeds a default PBR material on first edit, then merges patches', () => {
    const id = s().addPrimitive('box');
    expect(s().entities.find((e) => e.id === id)!.mesh!.material).toBeUndefined();

    s().updateMaterial(id, { metallic: 0.8 });
    const mat = s().entities.find((e) => e.id === id)!.mesh!.material!;
    expect(mat).toMatchObject({ shading: 'pbr', metallic: 0.8, roughness: 1 });

    s().updateMaterial(id, { roughness: 0.2, baseColorMap: '/uploads/rock.png' });
    const mat2 = s().entities.find((e) => e.id === id)!.mesh!.material!;
    expect(mat2).toMatchObject({ metallic: 0.8, roughness: 0.2, baseColorMap: '/uploads/rock.png' });
  });

  it('bumps sceneRevision so the viewport re-syncs', () => {
    const id = s().addPrimitive('sphere');
    const before = s().sceneRevision;
    s().updateMaterial(id, { shading: 'standard' });
    expect(s().sceneRevision).toBeGreaterThan(before);
  });

  it('is a no-op for an entity without a mesh', () => {
    const id = s().addLight('point');
    s().updateMaterial(id, { metallic: 1 });
    expect(s().entities.find((e) => e.id === id)!.mesh).toBeUndefined();
  });
});
