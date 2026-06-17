import { describe, it, expect } from 'vitest';
import type { Asset } from '@/types';
import { deriveTextureAssets, assetsWithTextures } from './deriveTextures';

const model = (id: string, textures: string[], rootUrl?: string): Asset => ({
  id, name: id, type: 'model', source: 'builtin', format: 'obj', textures, rootUrl,
});

describe('deriveTextureAssets', () => {
  it('derives one texture entry per referenced file', () => {
    const out = deriveTextureAssets([model('chicken', ['skin.png'])]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: 'skin.png', type: 'texture', format: 'png', textures: ['skin.png'] });
  });

  it('dedupes a shared texture across models by resolved URL', () => {
    const out = deriveTextureAssets([model('a', ['Texture_1.png']), model('b', ['Texture_1.png'])]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('tex:/assets/Texture_1.png');
  });

  it('keys dedupe on rootUrl, so same filename under different roots stays distinct', () => {
    const out = deriveTextureAssets([
      model('a', ['t.png'], '/uploads/a/'),
      model('b', ['t.png'], '/uploads/b/'),
    ]);
    expect(out).toHaveLength(2);
  });

  it('does not shadow an existing standalone texture asset', () => {
    const standalone: Asset = { id: 'tex', name: 'shared', type: 'texture', source: 'builtin', format: 'png', textures: ['shared.png'] };
    const out = deriveTextureAssets([standalone, model('a', ['shared.png'])]);
    expect(out).toHaveLength(0);
  });

  it('ignores non-model assets as derivation sources', () => {
    const standalone: Asset = { id: 'tex', name: 'loose', type: 'texture', source: 'builtin', format: 'png', textures: ['loose.png'] };
    expect(deriveTextureAssets([standalone])).toHaveLength(0);
  });
});

describe('assetsWithTextures', () => {
  it('appends derived textures after the real assets', () => {
    const m = model('chicken', ['skin.png']);
    const out = assetsWithTextures([m]);
    expect(out[0]).toBe(m);
    expect(out[1]).toMatchObject({ type: 'texture', name: 'skin.png' });
  });
});
