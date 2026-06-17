import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildManifest } from './gen-asset-manifest.mjs';

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'assets-'));
  // A model with a sibling MTL that points at a texture (absolute path, like ours).
  writeFileSync(join(dir, 'chicken_001.obj'), 'mtllib chicken_001.mtl\n');
  writeFileSync(join(dir, 'chicken_001.mtl'), 'newmtl m\nmap_Kd Texture_1.png\n');
  writeFileSync(join(dir, 'Texture_1.png'), '');
  // A glb model with no mtl/texture.
  writeFileSync(join(dir, 'robot.glb'), '');
  // A standalone image referenced by nobody.
  writeFileSync(join(dir, 'loose.png'), '');
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('buildManifest', () => {
  it('groups a model with its mtl and referenced textures', () => {
    const { assets } = buildManifest(dir);
    const chicken = assets.find((a) => a.id === 'chicken_001');
    expect(chicken).toMatchObject({
      type: 'model',
      source: 'builtin',
      format: 'obj',
      modelFile: 'chicken_001.obj',
      mtlFile: 'chicken_001.mtl',
      textures: ['Texture_1.png'],
    });
  });

  it('handles models with no material (glb)', () => {
    const robot = buildManifest(dir).assets.find((a) => a.id === 'robot');
    expect(robot).toMatchObject({ type: 'model', format: 'glb', mtlFile: null, textures: [] });
  });

  it('emits a model-referenced texture only as part of the model, not standalone', () => {
    const ids = buildManifest(dir).assets.map((a) => a.id);
    expect(ids).not.toContain('Texture_1'); // claimed by chicken_001
  });

  it('emits unreferenced images as standalone texture assets', () => {
    const loose = buildManifest(dir).assets.find((a) => a.id === 'loose');
    expect(loose).toMatchObject({ type: 'texture', textures: ['loose.png'] });
  });
});
