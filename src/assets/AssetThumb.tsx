import { useEffect, useState } from 'react';
import { Box, Image, Music } from 'lucide-react';
import type { Asset } from '@/types';
import { ASSET_ROOT } from '@/store/slices/assetSlice';
import { getThumbnail } from './thumbnailer';

/** Initial image src: a texture asset shows its own image; a model has none yet. */
const initialSrc = (asset: Asset): string | null =>
  asset.type === 'texture' && asset.textures[0] ? `${asset.rootUrl ?? ASSET_ROOT}${asset.textures[0]}` : null;

/**
 * Card thumbnail. Texture assets show their image directly; model assets show a
 * rendered preview (generated once, offscreen, then cached) and fall back to the
 * cube/image icon while rendering or if it fails.
 */
export function AssetThumb({ asset }: { asset: Asset }) {
  const [src, setSrc] = useState<string | null>(() => initialSrc(asset));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (asset.type !== 'model') return;
    let alive = true;
    getThumbnail(asset)
      .then((url) => alive && setSrc(url))
      .catch(() => {/* keep the icon fallback */});
    return () => {
      alive = false;
    };
  }, [asset]);

  if (src && !failed) {
    return <img className="asset-thumb-img" src={src} alt={asset.name} onError={() => setFailed(true)} />;
  }
  if (asset.type === 'audio') return <Music size={34} />;
  return asset.type === 'model' ? <Box size={34} /> : <Image size={34} />;
}
