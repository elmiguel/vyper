import type { Asset } from '@/types';
import { ASSET_ROOT } from '@/store/slices/assetSlice';

/** Resolved URL of a texture file within an asset — the cross-source dedupe key. */
const textureUrl = (asset: Asset, file: string) => `${asset.rootUrl ?? ASSET_ROOT}${file}`;

const extOf = (file: string) => file.split('.').pop()?.toLowerCase() ?? '';

/**
 * Synthetic texture assets derived from every model's `textures[]`, so the library
 * can list textures in their own right — not just the loose images the manifest
 * marks standalone. Deduped by resolved URL across all sources; a URL already owned
 * by a real texture asset is left to it rather than shadowed by a synthetic one.
 */
export function deriveTextureAssets(assets: Asset[]): Asset[] {
  const seen = new Set<string>();
  for (const a of assets) {
    if (a.type === 'texture') for (const f of a.textures) seen.add(textureUrl(a, f));
  }
  const out: Asset[] = [];
  for (const a of assets) {
    if (a.type !== 'model') continue;
    for (const f of a.textures) {
      const url = textureUrl(a, f);
      if (seen.has(url)) continue;
      seen.add(url);
      out.push({
        id: `tex:${url}`,
        name: f,
        type: 'texture',
        source: a.source,
        format: extOf(f),
        rootUrl: a.rootUrl,
        textures: [f],
      });
    }
  }
  return out;
}

/** Library display list: real assets followed by synthetic per-file textures. */
export function assetsWithTextures(assets: Asset[]): Asset[] {
  return [...assets, ...deriveTextureAssets(assets)];
}
