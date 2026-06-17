import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useEditorStore } from '@/store/editorStore';
import type { Entity } from '@/types';
import { ModelingPanel } from './ModelingPanel';

const box = (id: string, name: string): Entity =>
  ({
    id, name, parentId: null,
    transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
    mesh: { kind: 'box', color: '#fff', visible: true },
    scriptIds: [], props: {},
  } as Entity);

beforeEach(() => {
  useEditorStore.setState({ mode: '3d', entities: [] });
});

describe('ModelingPanel', () => {
  it('renders nothing in 2D mode', () => {
    useEditorStore.setState({ mode: '2d' });
    const { container } = render(<ModelingPanel entity={box('a', 'A')} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('prompts to add another mesh when there is no second candidate', () => {
    useEditorStore.setState({ entities: [box('a', 'A')] });
    render(<ModelingPanel entity={box('a', 'A')} />);
    expect(screen.getByText(/Add another mesh/i)).toBeInTheDocument();
  });

  it('offers boolean ops against another mesh', () => {
    useEditorStore.setState({ entities: [box('a', 'A'), box('b', 'B')] });
    render(<ModelingPanel entity={box('a', 'A')} />);
    expect(screen.getByText('Union')).toBeInTheDocument();
    expect(screen.getByText('Subtract')).toBeInTheDocument();
    expect(screen.getByText('Intersect')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'B' })).toBeInTheDocument();
  });
});
