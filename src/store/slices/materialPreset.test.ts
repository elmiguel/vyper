import { describe, it, expect, beforeEach } from 'vitest';
import type { MaterialConfig } from '@/types';
import { useEditorStore } from '../editorStore';

const s = () => useEditorStore.getState();
const mat: MaterialConfig = { shading: 'pbr', metallic: 1, roughness: 0.3, baseColorMap: '/uploads/rock_diff.jpg', normalMap: '/uploads/rock_nor.jpg' };

beforeEach(() => {
  useEditorStore.setState({ entities: [], materialPresets: {}, past: [], future: [], sceneRevision: 0 });
});

describe('material presets', () => {
  it('saves a named preset and reuses the id when saved again by the same name', () => {
    const id1 = s().saveMaterialPreset('Rock', mat);
    const id2 = s().saveMaterialPreset('Rock', { ...mat, roughness: 0.9 });
    expect(id1).toBe(id2);
    expect(Object.keys(s().materialPresets)).toHaveLength(1);
    expect(s().materialPresets[id1].material.roughness).toBe(0.9);
  });

  it('applies a preset to a mesh, replacing its material wholesale', () => {
    const eid = s().addPrimitive('box');
    // Pre-existing map that should be cleared by applying a preset that lacks it.
    s().updateMaterial(eid, { aoMap: '/uploads/old_ao.jpg' });
    const pid = s().saveMaterialPreset('Rock', mat);

    const before = s().sceneRevision;
    s().applyMaterialPreset(eid, pid);
    const applied = s().entities.find((e) => e.id === eid)!.mesh!.material!;
    expect(applied.baseColorMap).toBe('/uploads/rock_diff.jpg');
    expect(applied.metallic).toBe(1);
    expect(applied.aoMap).toBeUndefined(); // replaced, not merged
    expect(s().sceneRevision).toBeGreaterThan(before);
  });

  it('is a no-op for an unknown preset', () => {
    const eid = s().addPrimitive('box');
    expect(() => s().applyMaterialPreset(eid, 'nope')).not.toThrow();
  });

  it('removes a preset', () => {
    const pid = s().saveMaterialPreset('Rock', mat);
    s().removeMaterialPreset(pid);
    expect(s().materialPresets[pid]).toBeUndefined();
  });
});
