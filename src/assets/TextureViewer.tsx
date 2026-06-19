import { useState } from 'react';
import { ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import type { Asset } from '@/types';
import { ASSET_ROOT } from '@/store/slices/assetSlice';

/**
 * Shows an asset's texture image(s) over a checkerboard (so alpha is visible),
 * with zoom controls and a thumbnail strip when the asset has several textures.
 */
export function TextureViewer({ asset }: { asset: Asset }) {
  const textures = asset.textures ?? [];
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState(1);

  if (textures.length === 0) {
    return <div className="tex-empty">This asset has no textures.</div>;
  }

  const root = asset.rootUrl ?? ASSET_ROOT;
  // Generated Studio objects carry their texture maps as full URLs on the material; resolve from
  // those (not rootUrl + filename, which can be wrong for older saves).
  const m = asset.meshMaterial;
  const genUrls = asset.source === 'generated' && m
    ? ([m.baseColorMap, m.normalMap, m.roughnessMap, m.aoMap, m.emissiveMap].filter(Boolean) as string[])
    : null;
  const srcOf = (i: number) => genUrls?.[i] ?? `${root}${textures[i]}`;
  const src = srcOf(Math.min(active, textures.length - 1));

  return (
    <div className="tex-viewer">
      <div className="tex-bar">
        <button className="tex-zoom" onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))} title="Zoom out">
          <ZoomOut size={14} />
        </button>
        <span className="tex-zoom-label">{Math.round(zoom * 100)}%</span>
        <button className="tex-zoom" onClick={() => setZoom((z) => Math.min(8, z + 0.25))} title="Zoom in">
          <ZoomIn size={14} />
        </button>
        <button className="tex-zoom" onClick={() => setZoom(1)} title="Reset zoom">
          <Maximize size={14} />
        </button>
        <span className="tex-name">{textures[active]}</span>
      </div>

      <div className="tex-stage">
        <img className="tex-image" src={src} alt={textures[active]} style={{ transform: `scale(${zoom})` }} />
      </div>

      {textures.length > 1 && (
        <div className="tex-strip">
          {textures.map((t, i) => (
            <button key={t} className={`tex-thumb ${i === active ? 'on' : ''}`} onClick={() => setActive(i)} title={t}>
              <img src={srcOf(i)} alt={t} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
