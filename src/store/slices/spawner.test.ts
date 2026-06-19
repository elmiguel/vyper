import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '../editorStore';

const s = () => useEditorStore.getState();
const ent = (id: string) => s().entities.find((e) => e.id === id)!;

beforeEach(() => {
  useEditorStore.setState({ entities: [], past: [], future: [], sceneRevision: 0, selectedId: null });
});

describe('addSpawner', () => {
  it('creates a meshless spawner entity, selects it, and bumps the scene', () => {
    const before = s().sceneRevision;
    const id = s().addSpawner();
    const e = ent(id);
    expect(e.spawner).toEqual({ targetId: null });
    expect(e.mesh).toBeUndefined(); // editor-only billboard, no game mesh
    expect(s().selectedId).toBe(id);
    expect(s().sceneRevision).toBeGreaterThan(before);
  });
});

describe('setSpawnerTarget', () => {
  it('assigns a target and snaps the target onto the spawner location', () => {
    const spawner = s().addSpawner();
    s().updateTransform(spawner, { position: { x: 4, y: 2, z: -3 } });
    const box = s().addPrimitive('box');

    s().setSpawnerTarget(spawner, box);
    expect(ent(spawner).spawner!.targetId).toBe(box);
    expect(ent(box).transform.position).toEqual({ x: 4, y: 2, z: -3 });
  });

  it('drags the target along when the spawner is moved', () => {
    const spawner = s().addSpawner();
    const box = s().addPrimitive('box');
    s().setSpawnerTarget(spawner, box);

    s().updateTransform(spawner, { position: { x: 10, y: 0, z: 5 } });
    expect(ent(box).transform.position).toEqual({ x: 10, y: 0, z: 5 });
  });

  it('refuses to target itself and is a no-op on a non-spawner', () => {
    const spawner = s().addSpawner();
    s().setSpawnerTarget(spawner, spawner);
    expect(ent(spawner).spawner!.targetId).toBeNull();

    const box = s().addPrimitive('box');
    s().setSpawnerTarget(box, spawner); // box isn't a spawner
    expect(ent(box).spawner).toBeUndefined();
  });

  it('clears the target with null without moving anything', () => {
    const spawner = s().addSpawner();
    const box = s().addPrimitive('box');
    s().setSpawnerTarget(spawner, box);
    const pos = { ...ent(box).transform.position };

    s().setSpawnerTarget(spawner, null);
    expect(ent(spawner).spawner!.targetId).toBeNull();
    expect(ent(box).transform.position).toEqual(pos);
  });
});
