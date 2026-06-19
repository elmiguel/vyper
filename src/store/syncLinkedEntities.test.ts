import { describe, it, expect } from 'vitest';
import type { Asset, Entity } from '@/types';
import { syncLinkedEntities } from './editorDefaults';

const ent = (over: Partial<Entity['mesh']> = {}): Entity => ({
  id: 'e1', name: 'inst', parentId: null,
  transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
  mesh: { kind: 'custom', color: '#000', visible: true, custom: { positions: [0, 0, 0], indices: [], normals: [] }, ...over },
  scriptIds: [], props: {},
});

const asset = (over: Partial<Asset> = {}): Asset => ({
  id: 'gen-1', name: 'Mesh', type: 'model', source: 'generated', format: 'mesh', textures: [],
  geometry: { positions: [9, 9, 9], indices: [], normals: [] }, meshColor: '#fff',
  meshMaterial: { shading: 'pbr', metallic: 0, roughness: 1 }, ...over,
});

describe('syncLinkedEntities', () => {
  it('re-syncs a linked instance from its source asset (geometry/material/colour)', () => {
    const out = syncLinkedEntities([ent({ linkedAssetId: 'gen-1' })], [asset()]);
    expect(out[0].mesh!.custom!.positions).toEqual([9, 9, 9]);
    expect(out[0].mesh!.color).toBe('#fff');
    expect(out[0].mesh!.material).toEqual({ shading: 'pbr', metallic: 0, roughness: 1 });
  });

  it('leaves non-linked entities untouched (same array reference, no churn)', () => {
    const list = [ent()]; // no linkedAssetId
    expect(syncLinkedEntities(list, [asset()])).toBe(list);
  });

  it('leaves a linked instance alone when its asset is missing', () => {
    const list = [ent({ linkedAssetId: 'gone' })];
    expect(syncLinkedEntities(list, [asset()])).toBe(list);
  });
});
