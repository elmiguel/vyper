import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '../editorStore';

const s = () => useEditorStore.getState();

beforeEach(() => {
  useEditorStore.setState({ entities: [], scripts: {}, prefabs: {}, past: [], future: [], sceneRevision: 0 });
});

describe('prefabs', () => {
  it('savePrefab captures the entity and its behaviours', () => {
    const id = s().addPrimitive('box');
    s().updateMaterial(id, { metallic: 1 });
    const sid = s().addScript(id);

    const pid = s().savePrefab(id, 'Shiny Box');
    const prefab = s().prefabs[pid];
    expect(prefab.name).toBe('Shiny Box');
    expect(prefab.entity.mesh!.material!.metallic).toBe(1);
    expect(prefab.scripts.map((sc) => sc.id)).toEqual([sid]);
  });

  it('instantiatePrefab stamps a fresh entity with new entity + script ids', () => {
    const srcId = s().addPrimitive('sphere');
    const srcScript = s().addScript(srcId);
    const pid = s().savePrefab(srcId, 'Ball');

    // Clear the scene; the prefab is game-level and should still instantiate.
    useEditorStore.setState({ entities: [], scripts: {} });
    const newId = s().instantiatePrefab(pid);

    const e = s().entities.find((x) => x.id === newId)!;
    expect(e).toBeTruthy();
    expect(newId).not.toBe(srcId);
    // Behaviour was cloned with a brand-new id, and exists in the script table.
    expect(e.scriptIds[0]).not.toBe(srcScript);
    expect(s().scripts[e.scriptIds[0]]).toBeTruthy();
    expect(e.mesh!.kind).toBe('sphere');
    expect(s().selectedId).toBe(newId);
  });

  it('removePrefab deletes it from the library', () => {
    const id = s().addPrimitive('box');
    const pid = s().savePrefab(id, 'P');
    s().removePrefab(pid);
    expect(s().prefabs[pid]).toBeUndefined();
  });
});
