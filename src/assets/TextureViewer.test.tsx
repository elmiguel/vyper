import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Asset } from '@/types';
import { TextureViewer } from './TextureViewer';

const tex = (textures: string[]): Asset => ({
  id: 'a', name: 'a', type: 'model', source: 'builtin', format: 'obj', textures,
});

describe('TextureViewer', () => {
  it('shows an empty state when there are no textures', () => {
    render(<TextureViewer asset={tex([])} />);
    expect(screen.getByText(/no textures/i)).toBeInTheDocument();
  });

  it('renders the first texture from the asset root', () => {
    render(<TextureViewer asset={tex(['Texture_1.png'])} />);
    expect(screen.getByRole('img')).toHaveAttribute('src', '/assets/Texture_1.png');
  });

  it('zooms in and out', () => {
    render(<TextureViewer asset={tex(['Texture_1.png'])} />);
    expect(screen.getByText('100%')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Zoom in'));
    expect(screen.getByText('125%')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Reset zoom'));
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('switches between textures via the thumbnail strip', () => {
    render(<TextureViewer asset={tex(['a.png', 'b.png'])} />);
    // Main image + 2 thumbnails all present; clicking the 2nd thumb swaps the main image.
    const thumbs = screen.getAllByRole('button');
    fireEvent.click(thumbs[thumbs.length - 1]);
    expect(screen.getAllByRole('img')[0]).toHaveAttribute('src', '/assets/b.png');
  });
});
