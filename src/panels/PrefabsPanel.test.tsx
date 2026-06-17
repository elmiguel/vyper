import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useEditorStore } from '@/store/editorStore';
import { PrefabsPanel } from './PrefabsPanel';

const s = () => useEditorStore.getState();

beforeEach(() => {
  useEditorStore.setState({ entities: [], scripts: {}, prefabs: {}, past: [], future: [] });
});

describe('PrefabsPanel', () => {
  it('shows a hint when there are no prefabs', () => {
    render(<PrefabsPanel />);
    expect(screen.getByText(/Save as Prefab/i)).toBeInTheDocument();
  });

  it('lists prefabs and places an instance on click', () => {
    const id = s().addPrimitive('box');
    s().savePrefab(id, 'Crate');
    useEditorStore.setState({ entities: [] }); // empty scene

    render(<PrefabsPanel />);
    expect(screen.getByText('Crate')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Place'));
    expect(s().entities).toHaveLength(1);
    expect(s().entities[0].name).toBe('Crate');
  });
});
