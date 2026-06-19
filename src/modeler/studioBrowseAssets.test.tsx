import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Entity } from '@/types';
import { useEditorStore } from '@/store/editorStore';
import { useModelerStore } from './modelerStore';
import { ModelerInspector } from './ModelerInspector';
import { AssetBrowser } from '@/assets/AssetBrowser';

const s = () => useModelerStore.getState();

const meshEntity = (): Entity => ({
  id: 'model', name: 'Mesh', parentId: null,
  transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
  mesh: { kind: 'box', color: '#ffffff', visible: true },
  scriptIds: [], props: {},
});

beforeEach(() => {
  useEditorStore.setState({ mode: '3d', entities: [meshEntity()], assetLibrary: { assets: [] }, showAssetBrowser: false, past: [], future: [] });
  // AssetBrowser lazily loads the manifest on open.
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ assets: [] }) })) as unknown as typeof fetch);
  s().init();
  s().setComponent('object');
  s().applyPick({ kind: 'object', face: 0 }, false);
});

afterEach(() => vi.unstubAllGlobals());

describe('Studio: Material → Browse opens the asset library', () => {
  it('clicking Browse in the inspector renders the AssetBrowser dialog', () => {
    render(<><ModelerInspector /><AssetBrowser /></>);
    // Browser is closed initially.
    expect(screen.queryByRole('dialog', { name: /Asset library/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Browse' }));
    expect(useEditorStore.getState().showAssetBrowser).toBe(true);
    // The overlay actually mounts.
    expect(screen.getByRole('dialog', { name: /Asset library/i })).toBeInTheDocument();
  });
});
