import type { Asset, AssetLibrary } from '@/types';
import { listUploadedAssets, uploadAssets as uploadAssetsApi, deleteUploadedAsset } from '@/api/client';
import type { EditorState, StoreSet, StoreGet } from '../editorTypes';

type AssetSlice = Pick<
  EditorState,
  | 'loadAssetManifest'
  | 'uploadAssets'
  | 'addAsset'
  | 'hydrateGeneratedAssets'
  | 'updateAsset'
  | 'removeAsset'
  | 'deleteAsset'
  | 'copyAsset'
  | 'pasteAsset'
  | 'duplicateAsset'
  | 'selectAsset'
  | 'setShowAssetBrowser'
  | 'setShowAssetViewer'
>;

/** Synthetic, model-derived texture entries (see deriveTextures) use this id
 *  prefix; they aren't real library rows, so destructive actions skip them. */
const isSynthetic = (id: string) => id.startsWith('tex:');

/** A library copy of `src` under a fresh, unique id with a " copy" name. */
function cloneAsset(src: Asset, taken: Set<string>): Asset {
  let id = `${src.id.replace(/^tex:/, '')}-copy`;
  let n = 2;
  while (taken.has(id)) id = `${src.id.replace(/^tex:/, '')}-copy-${n++}`;
  return { ...src, id, name: `${src.name} copy`, source: src.source };
}

/** Merge asset lists by id (later entries win), preserving order. */
function mergeById(...lists: Asset[][]): Asset[] {
  const byId = new Map<string, Asset>();
  for (const list of lists) for (const a of list) byId.set(a.id, a);
  return [...byId.values()];
}

/** URL of the built-in asset folder (served by Vite from public/assets). */
export const ASSET_ROOT = '/assets/';

/**
 * Asset library: the browsable set of 3D models/textures. Built-ins are loaded
 * from public/assets/manifest.json; uploaded assets (Phase 5) merge in by id.
 * Mirrors designSlice conventions — immutable map/filter updates, record() for undo.
 */
export function createAssetSlice(set: StoreSet, get: StoreGet): AssetSlice {
  return {
    loadAssetManifest: async () => {
      // Each source falls back to what we already have, so a failed fetch never
      // wipes the other category (or a prior successful load).
      const prior = get().assetLibrary.assets;
      let builtins = prior.filter((a) => a.source === 'builtin');
      let uploaded = prior.filter((a) => a.source === 'uploaded');
      // Modeling-Studio creations are client-side; never let a manifest reload drop them.
      const generated = prior.filter((a) => a.source === 'generated');
      try {
        const res = await fetch(`${ASSET_ROOT}manifest.json`, { cache: 'no-cache' });
        if (res.ok) {
          const data = (await res.json()) as AssetLibrary;
          if (Array.isArray(data.assets)) builtins = data.assets;
        }
      } catch {
        /* offline / no manifest — keep prior built-ins */
      }
      try {
        const list = (await listUploadedAssets()).assets;
        if (Array.isArray(list)) uploaded = list;
      } catch {
        /* backend unavailable — keep prior uploads */
      }
      set({ assetLibrary: { assets: mergeById(mergeById(builtins, uploaded), generated) } });
    },

    uploadAssets: async (files) => {
      const { assets } = await uploadAssetsApi(files);
      set((s) => ({ assetLibrary: { assets: mergeById(s.assetLibrary.assets, assets) } }));
      return assets;
    },

    addAsset: (asset) => {
      get().record('addAsset');
      set((s) => ({ assetLibrary: { assets: [...s.assetLibrary.assets, asset] } }));
    },

    hydrateGeneratedAssets: (assets) => {
      // Restore project-persisted generated assets (Modeling-Studio objects) on open; merged by
      // id over the current library. Not an undoable edit, so it doesn't call record().
      set((s) => ({ assetLibrary: { assets: mergeById(s.assetLibrary.assets, assets) } }));
    },

    updateAsset: (id, patch) => {
      get().record(`asset:${id}`);
      set((s) => ({
        assetLibrary: {
          assets: s.assetLibrary.assets.map((a) => (a.id === id ? { ...a, ...patch } : a)),
        },
      }));
    },

    removeAsset: (id) => {
      get().record('removeAsset');
      set((s) => ({
        assetLibrary: { assets: s.assetLibrary.assets.filter((a) => a.id !== id) },
        selectedAssetId: s.selectedAssetId === id ? null : s.selectedAssetId,
      }));
    },

    deleteAsset: (id) => {
      if (isSynthetic(id)) return; // model-derived textures aren't deletable on their own
      const asset = get().assetLibrary.assets.find((a) => a.id === id);
      if (!asset) return;
      // Uploaded assets are server-backed — best-effort delete their files too.
      if (asset.source === 'uploaded') void deleteUploadedAsset(id).catch(() => {});
      get().removeAsset(id);
    },

    copyAsset: (id) => {
      const src = get().assetLibrary.assets.find((a) => a.id === id);
      if (src) set({ assetClipboard: { ...src } });
    },

    pasteAsset: () => {
      const clip = get().assetClipboard;
      if (!clip) return null;
      const taken = new Set(get().assetLibrary.assets.map((a) => a.id));
      const copy = cloneAsset(clip, taken);
      get().record('pasteAsset');
      set((s) => ({ assetLibrary: { assets: [...s.assetLibrary.assets, copy] }, selectedAssetId: copy.id }));
      return copy.id;
    },

    duplicateAsset: (id) => {
      const src = get().assetLibrary.assets.find((a) => a.id === id);
      if (!src) return null;
      const taken = new Set(get().assetLibrary.assets.map((a) => a.id));
      const copy = cloneAsset(src, taken);
      get().record('duplicateAsset');
      set((s) => ({ assetLibrary: { assets: [...s.assetLibrary.assets, copy] }, selectedAssetId: copy.id }));
      return copy.id;
    },

    selectAsset: (id) => set({ selectedAssetId: id }),
    setShowAssetBrowser: (v) => set({ showAssetBrowser: v }),
    setShowAssetViewer: (v) => set({ showAssetViewer: v }),
  };
}
