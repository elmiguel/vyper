import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useEditorStore } from '@/store/editorStore';
import { SpawnerPanel } from './SpawnerPanel';

const s = () => useEditorStore.getState();
const ent = (id: string) => s().entities.find((e) => e.id === id)!;

beforeEach(() => {
  useEditorStore.setState({ entities: [], past: [], future: [], sceneRevision: 0, selectedId: null });
});

describe('SpawnerPanel', () => {
  it('lists non-spawner objects and assigns + snaps the chosen one onto the spawner', () => {
    const spawner = s().addSpawner();
    s().updateTransform(spawner, { position: { x: 2, y: 1, z: 0 } });
    const box = s().addPrimitive('box');
    s().renameEntity(box, 'Crate');

    render(<SpawnerPanel entity={ent(spawner)} />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    // The other object is offered; the spawner itself is not.
    expect(screen.getByRole('option', { name: 'Crate' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Spawner' })).toBeNull();

    fireEvent.change(select, { target: { value: box } });
    expect(ent(spawner).spawner!.targetId).toBe(box);
    expect(ent(box).transform.position).toEqual({ x: 2, y: 1, z: 0 });
  });

  it('flags a target that no longer exists', () => {
    const spawner = s().addSpawner();
    const box = s().addPrimitive('box');
    s().setSpawnerTarget(spawner, box);
    s().removeEntity(box);

    render(<SpawnerPanel entity={ent(spawner)} />);
    expect(screen.getByText(/was removed/i)).toBeInTheDocument();
  });
});
