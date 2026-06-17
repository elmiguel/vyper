import type { MenuItem } from '@/ui/ContextMenu';
import type { Asset } from '@/types';
import { ASSET_ROOT } from '@/store/slices/assetSlice';

/** Synthetic, model-derived texture entries (deriveTextures) — not real library
 *  rows, so they can be viewed/exported but not renamed/duplicated/deleted. */
const isSynthetic = (a: Asset) => a.id.startsWith('tex:');

/** Trigger a browser download for each file an asset owns (model + mtl + textures). */
export function exportAsset(asset: Asset) {
  const root = asset.rootUrl ?? ASSET_ROOT;
  const files = [asset.modelFile, asset.mtlFile, ...(asset.textures ?? [])].filter((f): f is string => !!f);
  for (const f of files) {
    const a = document.createElement('a');
    a.href = `${root}${f}`;
    a.download = f;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}

/** Callbacks the asset context menu invokes. */
export interface AssetMenuActions {
  open: (id: string) => void;
  addToScene: (id: string) => void;
  rename: (asset: Asset) => void;
  copy: (id: string) => void;
  paste: () => void;
  duplicate: (id: string) => void;
  exportAsset: (asset: Asset) => void;
  remove: (id: string) => void;
  /** Whether the clipboard holds an asset (enables Paste). */
  canPaste: boolean;
}

/**
 * Build the right-click menu for an asset. Models get "Add to scene"; synthetic
 * model-derived textures only allow View/Export (they belong to their model).
 * Common actions (copy/paste/duplicate/rename/export/delete) apply to real rows.
 */
export function assetMenuItems(asset: Asset, act: AssetMenuActions): MenuItem[] {
  const synthetic = isSynthetic(asset);
  const isModel = asset.type === 'model';
  return [
    { label: isModel ? 'Edit / View' : 'View', onClick: () => act.open(asset.id) },
    ...(isModel ? [{ label: 'Add to scene', onClick: () => act.addToScene(asset.id) }] : []),
    { label: 'Rename', separator: true, disabled: synthetic, onClick: () => act.rename(asset) },
    { label: 'Copy', disabled: synthetic, onClick: () => act.copy(asset.id) },
    { label: 'Paste', disabled: !act.canPaste, onClick: act.paste },
    { label: 'Duplicate', disabled: synthetic, onClick: () => act.duplicate(asset.id) },
    { label: 'Export', separator: true, onClick: () => act.exportAsset(asset) },
    { label: 'Delete', danger: true, separator: true, disabled: synthetic, onClick: () => act.remove(asset.id) },
  ];
}
