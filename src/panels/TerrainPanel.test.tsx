import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useEditorStore } from '@/store/editorStore';
import { defaultBrush, defaultTerrain, type Entity } from '@/types';
import { TerrainPanel } from './TerrainPanel';

const terrain = (): Entity =>
  ({
    id: 't1', name: 'Terrain', parentId: null,
    transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
    mesh: { kind: 'terrain', color: '#6b8f5a', visible: true, terrain: defaultTerrain() },
    scriptIds: [], props: {},
  } as Entity);

beforeEach(() => {
  useEditorStore.setState({ entities: [terrain()], sculpting: false, brush: defaultBrush() });
});

describe('TerrainPanel', () => {
  it('renders terrain grid controls', () => {
    render(<TerrainPanel entity={terrain()} />);
    expect(screen.getByText('Terrain')).toBeInTheDocument();
    expect(screen.getByText('Size')).toBeInTheDocument();
    expect(screen.getByText('Max height')).toBeInTheDocument();
  });

  it('toggles the sculpt tool and reveals brush controls', () => {
    render(<TerrainPanel entity={terrain()} />);
    expect(screen.queryByText('Brush size')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Sculpt'));
    expect(useEditorStore.getState().sculpting).toBe(true);
    expect(screen.getByText('Brush size')).toBeInTheDocument();
  });

  it('selects a brush mode', () => {
    useEditorStore.setState({ sculpting: true });
    render(<TerrainPanel entity={terrain()} />);
    fireEvent.click(screen.getByText('lower'));
    expect(useEditorStore.getState().brush.mode).toBe('lower');
  });
});
