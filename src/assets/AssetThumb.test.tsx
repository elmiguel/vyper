import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { Asset } from '@/types';

const getThumbnail = vi.fn();
vi.mock('./thumbnailer', () => ({ getThumbnail: (a: Asset) => getThumbnail(a) }));

import { AssetThumb } from './AssetThumb';

const model: Asset = { id: 'dog', name: 'dog', type: 'model', source: 'builtin', format: 'obj', modelFile: 'dog.obj', textures: [] };
const texture: Asset = { id: 'tex', name: 'tex', type: 'texture', source: 'builtin', format: 'png', textures: ['tex.png'] };

beforeEach(() => getThumbnail.mockReset());

describe('AssetThumb', () => {
  it('shows the cube icon fallback while a model thumbnail renders', () => {
    getThumbnail.mockReturnValue(new Promise(() => {})); // never resolves
    const { container } = render(<AssetThumb asset={model} />);
    expect(container.querySelector('svg')).toBeTruthy(); // lucide icon
    expect(container.querySelector('img')).toBeNull();
  });

  it('swaps in the rendered preview once ready', async () => {
    getThumbnail.mockResolvedValue('data:image/png;base64,AAAA');
    render(<AssetThumb asset={model} />);
    await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', 'data:image/png;base64,AAAA'));
  });

  it('keeps the icon fallback if thumbnail generation fails', async () => {
    getThumbnail.mockRejectedValue(new Error('no webgl'));
    const { container } = render(<AssetThumb asset={model} />);
    await waitFor(() => expect(getThumbnail).toHaveBeenCalled());
    expect(container.querySelector('img')).toBeNull();
  });

  it('shows a texture asset image directly (no thumbnail render)', () => {
    render(<AssetThumb asset={texture} />);
    expect(screen.getByRole('img')).toHaveAttribute('src', '/assets/tex.png');
    expect(getThumbnail).not.toHaveBeenCalled();
  });
});
