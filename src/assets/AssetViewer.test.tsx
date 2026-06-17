import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Asset } from '@/types';
import { useEditorStore } from '@/store/editorStore';
import { AssetViewer } from './AssetViewer';

// ModelPreview spins up a real Babylon engine (no WebGL in jsdom) — stub it.
vi.mock('./ModelPreview', () => ({ ModelPreview: ({ asset }: { asset: Asset }) => <div data-testid="model-preview">{asset.name}</div> }));

const model: Asset = { id: 'chicken', name: 'chicken', type: 'model', source: 'builtin', format: 'obj', textures: ['Texture_1.png'] };
const texture: Asset = { id: 'tex', name: 'tex', type: 'texture', source: 'builtin', format: 'png', textures: ['tex.png'] };

function open(asset: Asset) {
  useEditorStore.setState({ assetLibrary: { assets: [asset] }, selectedAssetId: asset.id, showAssetViewer: true });
}

beforeEach(() => {
  useEditorStore.setState({ assetLibrary: { assets: [] }, selectedAssetId: null, showAssetViewer: false });
});

describe('AssetViewer', () => {
  it('renders nothing when hidden', () => {
    const { container } = render(<AssetViewer />);
    expect(container).toBeEmptyDOMElement();
  });

  it('opens a model on the Model tab with both tabs available', () => {
    open(model);
    render(<AssetViewer />);
    expect(screen.getByTestId('model-preview')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Model' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Textures/ })).toBeInTheDocument();
  });

  it('switches a model to the Textures tab', () => {
    open(model);
    render(<AssetViewer />);
    fireEvent.click(screen.getByRole('button', { name: /Textures/ }));
    expect(screen.queryByTestId('model-preview')).not.toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute('src', '/assets/Texture_1.png');
  });

  it('shows only the texture viewer (no Model tab) for a texture asset', () => {
    open(texture);
    render(<AssetViewer />);
    expect(screen.queryByRole('button', { name: 'Model' })).not.toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute('src', '/assets/tex.png');
  });

  it('closes via the close button', () => {
    open(model);
    render(<AssetViewer />);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(useEditorStore.getState().showAssetViewer).toBe(false);
  });
});
