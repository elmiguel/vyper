// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  parsePolyHavenList,
  polyHavenMaterialMaps,
  polyHavenHdri,
  parseAmbientCgList,
  ambientCgThumb,
  ambientCgZipUrl,
  ambientCgFieldFor,
  filenameFromUrl,
  isImageFile,
} from './cc0';

describe('Poly Haven', () => {
  it('parses the /assets map into catalogue items', () => {
    const items = parsePolyHavenList(
      { brick_wall: { name: 'Brick Wall', categories: ['brick'] }, mossy_rock: {} },
      'material',
    );
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ provider: 'polyhaven', id: 'brick_wall', name: 'Brick Wall', type: 'material' });
    expect(items[0].thumbUrl).toContain('brick_wall');
    // Missing name falls back to id.
    expect(items[1].name).toBe('mossy_rock');
  });

  it('resolves material maps to our fields, preferring jpg at the chosen res', () => {
    const files = {
      Diffuse: { '1k': { jpg: { url: 'https://x/d_1k.jpg' }, png: { url: 'https://x/d_1k.png' } } },
      nor_gl: { '1k': { jpg: { url: 'https://x/n_1k.jpg' } } },
      Rough: { '1k': { jpg: { url: 'https://x/r_1k.jpg' } } },
      AO: { '1k': { jpg: { url: 'https://x/ao_1k.jpg' } } },
    };
    const maps = polyHavenMaterialMaps(files, '1k');
    const byField = Object.fromEntries(maps.map((m) => [m.field, m.filename]));
    expect(byField).toEqual({ baseColorMap: 'd_1k.jpg', normalMap: 'n_1k.jpg', roughnessMap: 'r_1k.jpg', aoMap: 'ao_1k.jpg' });
  });

  it('falls back to another resolution when the requested one is absent', () => {
    const files = { Diffuse: { '2k': { jpg: { url: 'https://x/d_2k.jpg' } } } };
    const maps = polyHavenMaterialMaps(files, '1k');
    expect(maps[0].filename).toBe('d_2k.jpg');
  });

  it('resolves an HDRI download url', () => {
    const files = { hdri: { '1k': { hdr: { url: 'https://x/sky_1k.hdr' } } } } as never;
    expect(polyHavenHdri(files, '1k')).toEqual({ url: 'https://x/sky_1k.hdr', filename: 'sky_1k.hdr' });
  });
});

describe('ambientCG', () => {
  it('parses foundAssets into catalogue items, skipping entries without an id', () => {
    const items = parseAmbientCgList({
      foundAssets: [
        { assetId: 'Rock023', displayName: 'Rock 023', displayCategories: 'Rock/Ground', previewImage: { '256-PNG': 'https://acg/Rock023.png' } },
        { displayName: 'no id' },
      ],
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ provider: 'ambientcg', id: 'Rock023', categories: ['Rock', 'Ground'] });
    // Thumbnail comes from the API's previewImage block.
    expect(items[0].thumbUrl).toBe('https://acg/Rock023.png');
  });

  it('uses the previewImage thumbnail (prefers 256px), else falls back to a constructed url', () => {
    expect(ambientCgThumb({ '128-PNG': 'a', '256-PNG': 'b', '512-PNG': 'c' })).toBe('b');
    expect(ambientCgThumb(undefined)).toBe('');
    const [item] = parseAmbientCgList({ foundAssets: [{ assetId: 'Wood095' }] });
    expect(item.thumbUrl).toContain('Wood095');
  });

  it('builds the download archive url', () => {
    expect(ambientCgZipUrl('Rock023', '1K', 'JPG')).toBe('https://ambientcg.com/get?file=Rock023_1K-JPG.zip');
  });

  it('classifies extracted files by channel suffix', () => {
    expect(ambientCgFieldFor('Rock023_1K-JPG_Color.jpg')).toBe('baseColorMap');
    expect(ambientCgFieldFor('Rock023_1K-JPG_NormalGL.jpg')).toBe('normalMap');
    expect(ambientCgFieldFor('Rock023_1K-JPG_Roughness.jpg')).toBe('roughnessMap');
    expect(ambientCgFieldFor('Rock023_1K-JPG_AmbientOcclusion.jpg')).toBe('aoMap');
    expect(ambientCgFieldFor('Rock023_1K-JPG_Displacement.jpg')).toBeNull();
  });
});

describe('shared helpers', () => {
  it('strips path + query from a url to a filename', () => {
    expect(filenameFromUrl('https://x.com/a/b/rock_diff.jpg?width=256')).toBe('rock_diff.jpg');
  });
  it('only accepts served image extensions', () => {
    expect(isImageFile('a.png')).toBe(true);
    expect(isImageFile('a.JPG')).toBe(true);
    expect(isImageFile('a.usdc')).toBe(false);
    expect(isImageFile('readme.txt')).toBe(false);
  });
});
