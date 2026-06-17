import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { Asset } from '@/types';
import { useEditorStore } from '../editorStore';

const asset = (id: string, over: Partial<Asset> = {}): Asset => ({
  id,
  name: id,
  type: 'model',
  source: 'builtin',
  format: 'obj',
  textures: [],
  ...over,
});

// Reset the slice's library between tests (store is a singleton).
beforeEach(() => {
  useEditorStore.setState({ assetLibrary: { assets: [] }, selectedAssetId: null, showAssetBrowser: false, showAssetViewer: false, past: [], future: [] });
});

describe('assetSlice', () => {
  it('add / update / remove an asset', () => {
    const s = () => useEditorStore.getState();
    s().addAsset(asset('chicken'));
    expect(s().assetLibrary.assets.map((a) => a.id)).toEqual(['chicken']);

    s().updateAsset('chicken', { name: 'Chicken', notes: 'cluck' });
    expect(s().assetLibrary.assets[0]).toMatchObject({ name: 'Chicken', notes: 'cluck' });

    s().removeAsset('chicken');
    expect(s().assetLibrary.assets).toHaveLength(0);
  });

  it('clears the selection when the selected asset is removed', () => {
    const s = () => useEditorStore.getState();
    s().addAsset(asset('dog'));
    s().selectAsset('dog');
    s().removeAsset('dog');
    expect(s().selectedAssetId).toBeNull();
  });

  it('toggles browser/viewer visibility', () => {
    const s = () => useEditorStore.getState();
    s().setShowAssetBrowser(true);
    s().setShowAssetViewer(true);
    expect(s().showAssetBrowser).toBe(true);
    expect(s().showAssetViewer).toBe(true);
  });

  describe('loadAssetManifest', () => {
    afterEach(() => vi.unstubAllGlobals());

    // Route fetch by URL: the static manifest vs the backend uploads endpoint.
    const routedFetch = (manifest: unknown, uploaded: unknown) =>
      vi.fn(async (url: string) => {
        const body = String(url).includes('manifest.json') ? manifest : uploaded;
        return { ok: true, json: async () => body, status: 200 };
      }) as unknown as typeof fetch;

    it('merges built-in (manifest) and uploaded (backend) assets', async () => {
      const s = () => useEditorStore.getState();
      vi.stubGlobal('fetch', routedFetch(
        { assets: [asset('chicken_001'), asset('dog_001')] },
        { assets: [asset('my-upload', { source: 'uploaded' })] },
      ));
      await s().loadAssetManifest();
      const ids = s().assetLibrary.assets.map((a) => a.id).sort();
      expect(ids).toEqual(['chicken_001', 'dog_001', 'my-upload']);
    });

    it('keeps the library intact when both sources fail', async () => {
      const s = () => useEditorStore.getState();
      s().addAsset(asset('keep'));
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch);
      await s().loadAssetManifest();
      expect(s().assetLibrary.assets.map((a) => a.id)).toEqual(['keep']);
    });
  });

  describe('uploadAssets', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('posts files and merges the returned assets into the library', async () => {
      const s = () => useEditorStore.getState();
      const post = vi.fn(async () => ({ ok: true, status: 201, json: async () => ({ assets: [asset('horse', { source: 'uploaded' })] }) }));
      vi.stubGlobal('fetch', post as unknown as typeof fetch);
      const file = new File(['x'], 'horse.obj');
      const out = await s().uploadAssets([file]);
      expect(post).toHaveBeenCalledWith('/api/assets', expect.objectContaining({ method: 'POST' }));
      expect(out.map((a) => a.id)).toEqual(['horse']);
      expect(s().assetLibrary.assets.some((a) => a.id === 'horse')).toBe(true);
    });
  });
});
