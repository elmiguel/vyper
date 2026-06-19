import { describe, it, expect, beforeEach } from 'vitest';
import type { Entity } from '@/types';
import { useEditorStore } from '@/store/editorStore';
import { generatedAssetsOf } from '@/store/projectStore';
import { useModelerStore } from './modelerStore';

const s = () => useModelerStore.getState();
const ed = () => useEditorStore.getState();

const meshEntity = (): Entity => ({
  id: 'model', name: 'Crate', parentId: null,
  transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
  mesh: { kind: 'box', color: '#abcdef', visible: true },
  scriptIds: [], props: {},
});

beforeEach(() => {
  useEditorStore.setState({ entities: [meshEntity()], assetLibrary: { assets: [] }, past: [], future: [], sceneRevision: 0 });
  s().init();
  s().setComponent('object');
  s().applyPick({ kind: 'object', face: 0 }, false); // focus the whole cube (one island)
});

describe('Make asset (Modeling Studio)', () => {
  it('exports the focused object to the library with geometry + colour, and links it', () => {
    const id = s().makeSelectedObjectAsset();
    expect(id).toBeTruthy();
    const asset = ed().assetLibrary.assets.find((a) => a.id === id)!;
    expect(asset.source).toBe('generated');
    expect(asset.type).toBe('model');
    expect(asset.geometry!.positions.length).toBeGreaterThan(0);
    // UVs are baked in so the asset's textures map (scene + preview), not flat/black.
    expect(asset.geometry!.uvs!.length).toBeGreaterThan(0);
    expect(asset.meshColor).toBe('#abcdef');
    // Linked on the entity + reflected by the toggle selector.
    expect(s().selectedObjectAssetId()).toBe(id);
  });

  it('captures the material and ensures its texture maps are in the library', () => {
    ed().updateMaterial('model', { shading: 'pbr', metallic: 0, roughness: 1, baseColorMap: '/uploads/wood_diff.jpg' });
    const id = s().makeSelectedObjectAsset();
    const asset = ed().assetLibrary.assets.find((a) => a.id === id)!;
    expect(asset.meshMaterial?.baseColorMap).toBe('/uploads/wood_diff.jpg');
    // A texture asset now backs that map URL.
    const tex = ed().assetLibrary.assets.find((a) => a.type === 'texture' && a.textures[0] === 'wood_diff.jpg');
    expect(tex).toBeTruthy();
    // The material is registered as a reusable preset (so it shows in the Material dropdown).
    expect(Object.values(ed().materialPresets).some((p) => p.name === 'Crate material')).toBe(true);
  });

  it('removeSelectedObjectAsset clears the link and deletes the asset', () => {
    const id = s().makeSelectedObjectAsset()!;
    s().removeSelectedObjectAsset();
    expect(s().selectedObjectAssetId()).toBeNull();
    expect(ed().assetLibrary.assets.find((a) => a.id === id)).toBeUndefined();
  });

  it('does nothing when no whole object is selected (component mode)', () => {
    s().setComponent('vertex');
    expect(s().makeSelectedObjectAsset()).toBeNull();
  });

  it('reference toggle: instances link, republish updates in place, resolve re-syncs', () => {
    const id = s().makeSelectedObjectAsset()!;
    // Turn it into a reference/proxy asset.
    s().setSelectedObjectReference(true);
    expect(s().selectedObjectIsReference()).toBe(true);
    expect(ed().assetLibrary.assets.find((a) => a.id === id)!.reference).toBe(true);

    // An instance added to the scene is linked to the asset.
    const eid = ed().addModelEntity(id);
    expect(ed().entities.find((e) => e.id === eid)!.mesh!.linkedAssetId).toBe(id);

    // Re-running Make asset republishes in place (same id, reference flag kept).
    expect(s().makeSelectedObjectAsset()).toBe(id);
    expect(ed().assetLibrary.assets.find((a) => a.id === id)!.reference).toBe(true);

    // After the asset's geometry changes, resolving re-syncs the linked instance.
    ed().updateAsset(id, { geometry: { positions: [7, 7, 7], indices: [], normals: [] } });
    ed().resolveLinkedAssets();
    expect(ed().entities.find((e) => e.id === eid)!.mesh!.custom!.positions).toEqual([7, 7, 7]);
  });

  it('republishLinkedObjects updates the asset in place after the source is edited', () => {
    const id = s().makeSelectedObjectAsset()!;
    const before = ed().assetLibrary.assets.find((a) => a.id === id)!.geometry!.positions.slice();
    s().setSelectionCenter('y', 5); // edit the source object (move it up)
    s().republishLinkedObjects();
    const asset = ed().assetLibrary.assets.find((a) => a.id === id)!;
    expect(asset.geometry!.positions).not.toEqual(before); // asset reflects the edit
    expect(ed().assetLibrary.assets.filter((a) => a.source === 'generated' && a.type === 'model')).toHaveLength(1); // same id, no dup
  });

  it('non-reference asset: instances are independent copies (no link)', () => {
    const id = s().makeSelectedObjectAsset()!; // reference left off
    const eid = ed().addModelEntity(id);
    expect(ed().entities.find((e) => e.id === eid)!.mesh!.linkedAssetId).toBeUndefined();
  });

  it('generated assets are captured by generatedAssetsOf for persistence', () => {
    const id = s().makeSelectedObjectAsset()!;
    const settings = { generatedAssets: ed().assetLibrary.assets.filter((a) => a.source === 'generated') };
    const restored = generatedAssetsOf(settings);
    expect(restored.some((a) => a.id === id)).toBe(true);
    // And hydrate merges them back into a fresh library.
    useEditorStore.setState({ assetLibrary: { assets: [] } });
    ed().hydrateGeneratedAssets(restored);
    expect(ed().assetLibrary.assets.some((a) => a.id === id)).toBe(true);
  });
});
