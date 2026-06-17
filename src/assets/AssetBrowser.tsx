import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Upload, Loader2, X, Box, Globe } from 'lucide-react';
import { useEditorStore } from '@/store/editorStore';
import { AssetThumb } from './AssetThumb';
import { assetsWithTextures } from './deriveTextures';
import { Cc0Browser } from './Cc0Browser';
import { ContextMenu } from '@/ui/ContextMenu';
import { assetMenuItems, exportAsset } from './assetMenu';
import type { Asset } from '@/types';

type Filter = 'all' | 'model' | 'texture' | 'audio';
type Mode = 'library' | 'cc0';
interface CardMenu { x: number; y: number; asset: Asset; }

/**
 * Asset library browser. A full-screen overlay (GoalsEditor pattern) listing the
 * built-in + uploaded assets as cards. Clicking a card opens the Asset Viewer.
 * Gated on `showAssetBrowser`; mounted unconditionally from EditorLayout.
 */
export function AssetBrowser() {
  const show = useEditorStore((s) => s.showAssetBrowser);
  const assets = useEditorStore((s) => s.assetLibrary.assets);
  const loadManifest = useEditorStore((s) => s.loadAssetManifest);
  const setShow = useEditorStore((s) => s.setShowAssetBrowser);
  const selectAsset = useEditorStore((s) => s.selectAsset);
  const setShowViewer = useEditorStore((s) => s.setShowAssetViewer);
  const uploadAssets = useEditorStore((s) => s.uploadAssets);
  const addModelEntity = useEditorStore((s) => s.addModelEntity);
  const updateAsset = useEditorStore((s) => s.updateAsset);
  const deleteAsset = useEditorStore((s) => s.deleteAsset);
  const copyAsset = useEditorStore((s) => s.copyAsset);
  const pasteAsset = useEditorStore((s) => s.pasteAsset);
  const duplicateAsset = useEditorStore((s) => s.duplicateAsset);
  const canPaste = useEditorStore((s) => s.assetClipboard != null);

  const [mode, setMode] = useState<Mode>('library');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [cardMenu, setCardMenu] = useState<CardMenu | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const renameAsset = (asset: Asset) => {
    const name = window.prompt('Rename asset', asset.name)?.trim();
    if (name && name !== asset.name) updateAsset(asset.id, { name });
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setUploadError('');
    try {
      await uploadAssets(Array.from(files));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  // Lazily load the built-in manifest the first time the browser is opened.
  useEffect(() => {
    if (show && assets.length === 0) void loadManifest();
  }, [show, assets.length, loadManifest]);

  // Models plus a synthetic entry per referenced texture, so the Textures filter
  // lists every texture in the library — not just loose, model-less images.
  const displayAssets = useMemo(() => assetsWithTextures(assets), [assets]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return displayAssets.filter(
      (a) =>
        (filter === 'all' || a.type === filter) &&
        (!q || a.name.toLowerCase().includes(q) || (a.tags ?? []).some((t) => t.toLowerCase().includes(q))),
    );
  }, [displayAssets, filter, query]);

  if (!show) return null;

  const open = (id: string) => {
    selectAsset(id);
    setShowViewer(true);
  };

  return (
    <div className="sc-backdrop" onClick={() => setShow(false)}>
      <div className="sc-modal asset-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Asset library">
        <header className="sc-head">
          <div className="sc-title">
            <Box size={17} />
            <span>Assets</span>
          </div>
          <div className="asset-toolbar">
            <button className={`asset-filter ${mode === 'library' ? 'on' : ''}`} onClick={() => setMode('library')}>
              <Box size={12} /> Library
            </button>
            <button className={`asset-filter ${mode === 'cc0' ? 'on' : ''}`} onClick={() => setMode('cc0')} title="Browse free CC0 materials & HDRIs">
              <Globe size={12} /> CC0 Library
            </button>
            {mode === 'library' && (
              <>
                <div className="asset-search">
                  <Search size={13} />
                  <input placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />
                </div>
                {(['all', 'model', 'texture', 'audio'] as Filter[]).map((f) => (
                  <button key={f} className={`asset-filter ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>
                    {f === 'all' ? 'All' : f === 'model' ? 'Models' : f === 'texture' ? 'Textures' : 'Audio'}
                  </button>
                ))}
                <input
                  ref={fileInput}
                  type="file"
                  multiple
                  accept=".obj,.mtl,.gltf,.glb,.png,.jpg,.jpeg,.webp,.mp3,.wav,.ogg,.m4a,.aac,.flac"
                  style={{ display: 'none' }}
                  onChange={(e) => { void onFiles(e.target.files); e.target.value = ''; }}
                />
                <button className="asset-upload" disabled={uploading} onClick={() => fileInput.current?.click()} title="Upload models, textures, or audio clips">
                  {uploading ? <Loader2 size={13} className="spin" /> : <Upload size={13} />} Upload
                </button>
              </>
            )}
          </div>
          <button className="sc-close" onClick={() => setShow(false)} aria-label="Close">
            <X size={16} />
          </button>
        </header>

        {mode === 'cc0' ? (
          <Cc0Browser />
        ) : (
        <div className="asset-body">
          {shown.length === 0 ? (
            <div className="asset-empty">
              {assets.length === 0
                ? 'No assets found. Drop models into public/assets and run `npm run assets:manifest`.'
                : 'No assets match your filter.'}
            </div>
          ) : (
            <div className="asset-grid">
              {shown.map((a) => (
                <button
                  key={a.id}
                  className="asset-card"
                  onClick={() => open(a.id)}
                  onContextMenu={(e) => { e.preventDefault(); setCardMenu({ x: e.clientX, y: e.clientY, asset: a }); }}
                  title={a.name}
                >
                  <div className="asset-thumb"><AssetThumb asset={a} /></div>
                  <div className="asset-meta">
                    <span className="asset-name">{a.name}</span>
                    <span className="asset-format">{a.format.toUpperCase()}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        )}

        {mode === 'library' && (
          <footer className="sc-foot asset-foot">
            {uploadError && <span className="asset-upload-err">{uploadError}</span>}
            <span className="asset-count">{shown.length} of {displayAssets.length} assets</span>
          </footer>
        )}
      </div>

      {cardMenu && (
        <ContextMenu
          x={cardMenu.x}
          y={cardMenu.y}
          onClose={() => setCardMenu(null)}
          items={assetMenuItems(cardMenu.asset, {
            open,
            addToScene: (id) => { addModelEntity(id); setShow(false); },
            rename: renameAsset,
            copy: copyAsset,
            paste: () => { pasteAsset(); },
            duplicate: (id) => { duplicateAsset(id); },
            exportAsset,
            remove: deleteAsset,
            canPaste,
          })}
        />
      )}
    </div>
  );
}
