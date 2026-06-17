import { describe, it, expect, vi } from 'vitest';
import type { Asset } from '@/types';
import type { MenuItem } from '@/ui/ContextMenu';
import { assetMenuItems, type AssetMenuActions } from './assetMenu';

const model: Asset = { id: 'dog', name: 'dog', type: 'model', source: 'uploaded', format: 'obj', modelFile: 'dog.obj', textures: [] };
const texture: Asset = { id: 'grass', name: 'grass', type: 'texture', source: 'uploaded', format: 'jpg', textures: ['grass.jpg'] };
const synthetic: Asset = { id: 'tex:/assets/Texture_1.png', name: 'Texture_1.png', type: 'texture', source: 'builtin', format: 'png', textures: ['Texture_1.png'] };

const noopActions = (over: Partial<AssetMenuActions> = {}): AssetMenuActions => ({
  open: vi.fn(), addToScene: vi.fn(), rename: vi.fn(), copy: vi.fn(), paste: vi.fn(),
  duplicate: vi.fn(), exportAsset: vi.fn(), remove: vi.fn(), canPaste: false, ...over,
});

const labels = (items: MenuItem[]) => items.map((i) => i.label);
const find = (items: MenuItem[], label: string) => items.find((i) => i.label === label);

describe('assetMenuItems', () => {
  it('offers "Add to scene" for models, not textures', () => {
    expect(labels(assetMenuItems(model, noopActions()))).toContain('Add to scene');
    expect(labels(assetMenuItems(texture, noopActions()))).not.toContain('Add to scene');
  });

  it('disables Paste unless the clipboard has an asset', () => {
    expect(find(assetMenuItems(model, noopActions({ canPaste: false })), 'Paste')?.disabled).toBe(true);
    expect(find(assetMenuItems(model, noopActions({ canPaste: true })), 'Paste')?.disabled).toBe(false);
  });

  it('disables destructive actions for synthetic (model-derived) textures', () => {
    const items = assetMenuItems(synthetic, noopActions());
    for (const l of ['Rename', 'Copy', 'Duplicate', 'Delete']) expect(find(items, l)?.disabled).toBe(true);
    expect(find(items, 'Export')?.disabled).toBeFalsy(); // export still allowed
    expect(find(items, 'View')?.disabled).toBeFalsy();
  });

  it('marks Delete as destructive', () => {
    expect(find(assetMenuItems(model, noopActions()), 'Delete')?.danger).toBe(true);
  });

  it('routes clicks to the right callbacks', () => {
    const act = noopActions();
    const items = assetMenuItems(model, act);
    find(items, 'Add to scene')!.onClick!();
    find(items, 'Delete')!.onClick!();
    expect(act.addToScene).toHaveBeenCalledWith('dog');
    expect(act.remove).toHaveBeenCalledWith('dog');
  });
});
