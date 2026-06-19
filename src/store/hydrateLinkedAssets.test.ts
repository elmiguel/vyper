import { describe, it, expect, beforeEach } from 'vitest';
import type { Asset, Entity } from '@/types';
import { useEditorStore } from './editorStore';

const linkedInstance = (): Entity => ({
  id: 'i1', name: 'platform', parentId: null,
  transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
  // Stale geometry — should be replaced from the source asset on load.
  mesh: { kind: 'custom', color: '#000000', visible: true, custom: { positions: [0, 0, 0], indices: [], normals: [] }, linkedAssetId: 'gen-1' },
  scriptIds: [], props: {},
});

const sourceAsset = (): Asset => ({
  id: 'gen-1', name: 'Platform', type: 'model', source: 'generated', format: 'mesh', textures: [],
  geometry: { positions: [5, 5, 5], indices: [], normals: [] }, meshColor: '#abcdef', reference: true,
});

beforeEach(() => {
  useEditorStore.setState({ mode: '3d', assetLibrary: { assets: [sourceAsset()] }, past: [], future: [] });
});

describe('reload: hydrateScene re-syncs linked (proxy) instances', () => {
  it('a linked instance adopts its source asset geometry/colour on hydrate', () => {
    useEditorStore.getState().hydrateScene({ entities: [linkedInstance()], gameCamera: null, gridVisible: true } as never);
    const inst = useEditorStore.getState().entities[0];
    expect(inst.mesh!.custom!.positions).toEqual([5, 5, 5]); // updated from source
    expect(inst.mesh!.color).toBe('#abcdef');
  });

  it('a non-linked entity is left untouched on hydrate', () => {
    const copy: Entity = { ...linkedInstance(), id: 'i2', mesh: { kind: 'custom', color: '#000', visible: true, custom: { positions: [1, 2, 3], indices: [], normals: [] } } };
    useEditorStore.getState().hydrateScene({ entities: [copy], gameCamera: null, gridVisible: true } as never);
    expect(useEditorStore.getState().entities[0].mesh!.custom!.positions).toEqual([1, 2, 3]);
  });
});
