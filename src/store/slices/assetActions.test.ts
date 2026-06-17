import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Asset } from '@/types';
import { useEditorStore } from '../editorStore';

// deleteAsset calls the server for uploaded assets — stub the client.
const deleteUploadedAsset = vi.fn(async (_id: string) => undefined);
vi.mock('@/api/client', () => ({
  listUploadedAssets: vi.fn(),
  uploadAssets: vi.fn(),
  deleteUploadedAsset: (id: string) => deleteUploadedAsset(id),
}));

const a = (id: string, over: Partial<Asset> = {}): Asset => ({
  id, name: id, type: 'model', source: 'uploaded', format: 'obj', modelFile: `${id}.obj`, textures: [], ...over,
});
const s = () => useEditorStore.getState();

beforeEach(() => {
  deleteUploadedAsset.mockClear();
  useEditorStore.setState({ assetLibrary: { assets: [a('dog'), a('cat')] }, assetClipboard: null, selectedAssetId: null, past: [], future: [] });
});

describe('asset library actions', () => {
  it('deleteAsset removes an uploaded asset and tells the server', () => {
    s().deleteAsset('dog');
    expect(s().assetLibrary.assets.map((x) => x.id)).toEqual(['cat']);
    expect(deleteUploadedAsset).toHaveBeenCalledWith('dog');
  });

  it('deleteAsset does NOT hit the server for built-in assets', () => {
    useEditorStore.setState({ assetLibrary: { assets: [a('chicken', { source: 'builtin' })] } });
    s().deleteAsset('chicken');
    expect(s().assetLibrary.assets).toHaveLength(0);
    expect(deleteUploadedAsset).not.toHaveBeenCalled();
  });

  it('deleteAsset ignores synthetic (model-derived) texture ids', () => {
    s().deleteAsset('tex:/assets/Texture_1.png');
    expect(s().assetLibrary.assets).toHaveLength(2); // unchanged
  });

  it('copy + paste clones an asset under a fresh id', () => {
    s().copyAsset('dog');
    expect(s().assetClipboard?.id).toBe('dog');
    const newId = s().pasteAsset();
    expect(newId).toBe('dog-copy');
    expect(s().assetLibrary.assets.find((x) => x.id === 'dog-copy')?.name).toBe('dog copy');
  });

  it('duplicateAsset avoids id collisions', () => {
    s().duplicateAsset('dog');
    s().duplicateAsset('dog');
    const ids = s().assetLibrary.assets.map((x) => x.id);
    expect(ids).toContain('dog-copy');
    expect(ids).toContain('dog-copy-2');
  });

  it('pasteAsset is a no-op with an empty clipboard', () => {
    expect(s().pasteAsset()).toBeNull();
    expect(s().assetLibrary.assets).toHaveLength(2);
  });
});
