import { useEffect, useMemo, useState } from 'react';
import { Box, Image, Plus, X } from 'lucide-react';
import { useEditorStore } from '@/store/editorStore';
import { ModelPreview } from './ModelPreview';
import { TextureViewer } from './TextureViewer';
import { AssetEditor } from './AssetEditor';
import { assetsWithTextures } from './deriveTextures';

type Tab = 'model' | 'textures' | 'edit';

/**
 * Full-screen viewer for the selected asset, opened from the Asset Browser.
 * Tabs: a live 3D model preview (with animation playback) and a texture viewer.
 * The Edit tab is added in a later phase. Gated on `showAssetViewer`.
 */
export function AssetViewer() {
  const show = useEditorStore((s) => s.showAssetViewer);
  const assetId = useEditorStore((s) => s.selectedAssetId);
  const assets = useEditorStore((s) => s.assetLibrary.assets);
  // Include synthetic per-texture entries so a texture opened from the browser resolves.
  const asset = useMemo(() => assetsWithTextures(assets).find((a) => a.id === assetId), [assets, assetId]);
  const setShow = useEditorStore((s) => s.setShowAssetViewer);
  const addModelEntity = useEditorStore((s) => s.addModelEntity);
  const setShowBrowser = useEditorStore((s) => s.setShowAssetBrowser);

  const isModel = asset?.type === 'model';
  const [tab, setTab] = useState<Tab>('model');

  // Default to the only meaningful tab for the asset type whenever it changes.
  useEffect(() => {
    setTab(isModel ? 'model' : 'textures');
  }, [assetId, isModel]);

  if (!show || !asset) return null;

  return (
    <div className="sc-backdrop" onClick={() => setShow(false)}>
      <div className="sc-modal asset-viewer-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Asset: ${asset.name}`}>
        <header className="sc-head">
          <div className="sc-title">
            {isModel ? <Box size={17} /> : <Image size={17} />}
            <span>{asset.name}</span>
          </div>
          <div className="av-tabs">
            {isModel && (
              <button className={`av-tab ${tab === 'model' ? 'on' : ''}`} onClick={() => setTab('model')}>Model</button>
            )}
            <button className={`av-tab ${tab === 'textures' ? 'on' : ''}`} onClick={() => setTab('textures')}>
              Textures{asset.textures.length ? ` (${asset.textures.length})` : ''}
            </button>
            <button className={`av-tab ${tab === 'edit' ? 'on' : ''}`} onClick={() => setTab('edit')}>Edit</button>
          </div>
          {isModel && (
            <button
              className="av-add"
              onClick={() => { addModelEntity(asset.id); setShow(false); setShowBrowser(false); }}
              title="Place this model into the scene"
            >
              <Plus size={14} /> Add to scene
            </button>
          )}
          <button className="sc-close" onClick={() => setShow(false)} aria-label="Close">
            <X size={16} />
          </button>
        </header>

        <div className="av-body">
          {tab === 'textures' && <TextureViewer asset={asset} />}
          {tab === 'model' && isModel && <ModelPreview asset={asset} />}
          {tab === 'edit' && (
            <div className="av-edit">
              {isModel && <div className="av-edit-preview"><ModelPreview asset={asset} /></div>}
              <AssetEditor asset={asset} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
