// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { buildUploadedAssets, orphanedFiles, UPLOADS_URL, type UploadedAsset } from './assetUploads';

describe('buildUploadedAssets', () => {
  it('groups an OBJ with its MTL and all batch images as one model asset', () => {
    const assets = buildUploadedAssets(['dog.obj', 'dog.mtl', 'Texture_1.png']);
    expect(assets).toHaveLength(1);
    expect(assets[0]).toMatchObject({
      id: 'dog',
      type: 'model',
      source: 'uploaded',
      format: 'obj',
      rootUrl: UPLOADS_URL,
      modelFile: 'dog.obj',
      mtlFile: 'dog.mtl',
      textures: ['Texture_1.png'],
    });
  });

  it('handles a glb model with no material', () => {
    const [a] = buildUploadedAssets(['robot.glb']);
    expect(a).toMatchObject({ type: 'model', format: 'glb', mtlFile: null, textures: [] });
  });

  it('treats images as standalone textures when no model is in the batch', () => {
    const assets = buildUploadedAssets(['a.png', 'b.jpg']);
    expect(assets.map((x) => x.type)).toEqual(['texture', 'texture']);
    expect(assets[0]).toMatchObject({ id: 'a', rootUrl: UPLOADS_URL, textures: ['a.png'] });
  });

  it('does not emit standalone textures when a model claims them', () => {
    const ids = buildUploadedAssets(['dog.obj', 'skin.png']).map((a) => a.id);
    expect(ids).toEqual(['dog']); // skin.png folded into the model, not standalone
  });

  it('groups audio files as standalone audio assets', () => {
    const assets = buildUploadedAssets(['ambience.mp3', 'splash.wav']);
    expect(assets.map((a) => a.type)).toEqual(['audio', 'audio']);
    expect(assets[0]).toMatchObject({ id: 'ambience', format: 'mp3', rootUrl: UPLOADS_URL, textures: ['ambience.mp3'] });
  });

  it('keeps audio standalone even alongside a model (not folded into it)', () => {
    const assets = buildUploadedAssets(['dog.obj', 'skin.png', 'bark.ogg']);
    const audio = assets.find((a) => a.type === 'audio');
    expect(audio).toMatchObject({ id: 'bark', textures: ['bark.ogg'] });
  });
});

describe('orphanedFiles', () => {
  const A = (over: Partial<UploadedAsset>): UploadedAsset => ({
    id: 'a', name: 'a', type: 'model', source: 'uploaded', format: 'obj', rootUrl: UPLOADS_URL, textures: [], ...over,
  });

  it('returns all of a deleted asset\'s files when nothing else uses them', () => {
    const target = A({ id: 'dog', modelFile: 'dog.obj', mtlFile: 'dog.mtl', textures: ['skin.png'] });
    expect(orphanedFiles(target, []).sort()).toEqual(['dog.mtl', 'dog.obj', 'skin.png']);
  });

  it('keeps a shared texture still referenced by another asset', () => {
    const target = A({ id: 'dog', modelFile: 'dog.obj', textures: ['shared.png'] });
    const other = A({ id: 'cat', modelFile: 'cat.obj', textures: ['shared.png'] });
    expect(orphanedFiles(target, [other])).toEqual(['dog.obj']); // shared.png survives
  });
});
