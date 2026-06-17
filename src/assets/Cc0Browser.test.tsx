import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { useEditorStore } from '@/store/editorStore';
import type { Cc0Item } from '@/api/client';

// Mock the network layer so the browser is tested in isolation.
vi.mock('@/api/client', () => ({
  browseCc0: vi.fn(),
  importCc0: vi.fn(),
}));
import { browseCc0, importCc0 } from '@/api/client';
import { Cc0Browser } from './Cc0Browser';

const item: Cc0Item = {
  provider: 'polyhaven', id: 'brick_wall', name: 'Brick Wall', type: 'material',
  thumbUrl: 'https://cdn/brick.png', categories: ['brick'],
};

beforeEach(() => {
  useEditorStore.setState({ entities: [], selectedId: null, assetLibrary: { assets: [] } });
  vi.mocked(browseCc0).mockResolvedValue({ items: [item] });
  vi.mocked(importCc0).mockResolvedValue({
    assets: [{ id: 'brick_diff', name: 'brick_diff.jpg', type: 'texture', source: 'uploaded', format: 'jpg', rootUrl: '/uploads/', textures: ['brick_diff.jpg'] }],
    material: { baseColorMap: '/uploads/brick_diff.jpg', normalMap: '/uploads/brick_nor.jpg' },
  });
});

describe('Cc0Browser', () => {
  it('loads and lists catalogue items', async () => {
    render(<Cc0Browser />);
    expect(await screen.findByText('Brick Wall')).toBeInTheDocument();
    expect(browseCc0).toHaveBeenCalledWith('polyhaven', 'material');
  });

  it('imports an item: adds its assets and applies maps to the selected mesh', async () => {
    const id = useEditorStore.getState().addPrimitive('box');
    useEditorStore.setState({ selectedId: id });

    render(<Cc0Browser />);
    fireEvent.click(await screen.findByText('Import'));

    await waitFor(() => expect(importCc0).toHaveBeenCalledWith({ provider: 'polyhaven', id: 'brick_wall', type: 'material' }));
    await waitFor(() => {
      const mat = useEditorStore.getState().entities.find((e) => e.id === id)!.mesh!.material;
      expect(mat?.baseColorMap).toBe('/uploads/brick_diff.jpg');
    });
    // The downloaded texture was added to the library.
    expect(useEditorStore.getState().assetLibrary.assets.some((a) => a.id === 'brick_diff')).toBe(true);
  });

  it('shows an error when the catalogue fails to load', async () => {
    vi.mocked(browseCc0).mockRejectedValueOnce(new Error('network down'));
    render(<Cc0Browser />);
    expect(await screen.findByText(/network down/i)).toBeInTheDocument();
  });
});
