import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useEditorStore } from '@/store/editorStore';
import type { Entity } from '@/types';
import { ModelingTools } from './ModelingTools';

const box = (id: string, name: string): Entity =>
  ({
    id, name, parentId: null,
    transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
    mesh: { kind: 'box', color: '#fff', visible: true },
    scriptIds: [], props: {},
  } as Entity);

beforeEach(() => {
  useEditorStore.setState({
    mode: '3d',
    entities: [],
    selectedId: null,
    meshEdit: { active: false, entityId: null, component: 'face', selection: [], sculpt: null, tool: 'select' },
  });
});

describe('ModelingTools', () => {
  it('offers primitive spawn buttons in 3D', () => {
    render(<ModelingTools />);
    expect(screen.getByText('Box')).toBeInTheDocument();
    expect(screen.getByText('Cylinder')).toBeInTheDocument();
  });

  it('notes that modeling needs 3D mode in 2D', () => {
    useEditorStore.setState({ mode: '2d' });
    render(<ModelingTools />);
    expect(screen.getByText(/available in 3D mode/i)).toBeInTheDocument();
  });

  it('disables Edit Mode until an editable mesh is selected', () => {
    render(<ModelingTools />);
    const btn = screen.getByRole('button', { name: /Enter Edit Mode/i });
    expect(btn).toBeDisabled();
  });

  it('enables Edit Mode for a selected primitive and reflects active state', () => {
    useEditorStore.setState({ entities: [box('a', 'Box')], selectedId: 'a' });
    const { rerender } = render(<ModelingTools />);
    expect(screen.getByRole('button', { name: /Enter Edit Mode/i })).toBeEnabled();

    // When Edit Mode is active for the selection, the toggle flips to Exit + shows ops.
    useEditorStore.setState({ meshEdit: { active: true, entityId: 'a', component: 'face', selection: [], sculpt: null, tool: 'select' } });
    rerender(<ModelingTools />);
    expect(screen.getByRole('button', { name: /Exit Edit Mode/i })).toBeInTheDocument();
    expect(screen.getByText('extrude')).toBeInTheDocument();
    // Sculpt brushes are offered in Edit Mode.
    expect(screen.getByText('draw')).toBeInTheDocument();
    expect(screen.getByText('inflate')).toBeInTheDocument();
  });

  it('shows sculpt radius/strength controls once a brush is active', () => {
    useEditorStore.setState({
      entities: [box('a', 'Box')],
      selectedId: 'a',
      meshEdit: { active: true, entityId: 'a', component: 'face', selection: [], sculpt: { radius: 2, strength: 0.5, mode: 'draw' }, tool: 'select' },
    });
    render(<ModelingTools />);
    expect(screen.getByText(/Radius/i)).toBeInTheDocument();
    expect(screen.getByText(/Strength/i)).toBeInTheDocument();
    expect(screen.getByText(/Invert/i)).toBeInTheDocument();
  });
});
