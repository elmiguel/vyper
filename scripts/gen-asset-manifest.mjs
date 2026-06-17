// Scans public/assets/ and writes public/assets/manifest.json — the list the app
// reads to populate its built-in asset library. Run via `npm run assets:manifest`
// (also fires automatically on predev/prebuild).
//
// Grouping rule: model files (.obj/.gltf/.glb) become asset records. A model's
// sibling material (.mtl of the same basename) and any textures it references are
// attached. Loose image files that no model references become standalone texture
// assets so they're still browsable.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, parse } from 'node:path';
import { fileURLToPath } from 'node:url';

const ASSETS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets');

const MODEL_EXT = new Set(['.obj', '.gltf', '.glb']);
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.ktx2']);

/** Texture filenames referenced by an .mtl (map_* lines), basename-only. */
function texturesFromMtl(mtlPath) {
  const out = new Set();
  for (const line of readFileSync(mtlPath, 'utf8').split('\n')) {
    const m = line.trim().match(/^map_\w+\s+(.*\S)/i);
    if (m) out.add(parse(m[1].replace(/\\/g, '/')).base);
  }
  return [...out];
}

export function buildManifest(dir = ASSETS_DIR) {
  const files = readdirSync(dir);
  const byName = new Map(files.map((f) => [f, parse(f)]));
  const used = new Set(); // image files claimed by a model

  const models = files
    .filter((f) => MODEL_EXT.has(byName.get(f).ext.toLowerCase()))
    .map((file) => {
      const { name, ext } = byName.get(file);
      const mtlFile = files.find((f) => f === `${name}.mtl`);
      const textures = mtlFile ? texturesFromMtl(join(dir, mtlFile)).filter((t) => files.includes(t)) : [];
      textures.forEach((t) => used.add(t));
      return {
        id: name,
        name,
        type: 'model',
        source: 'builtin',
        format: ext.slice(1).toLowerCase(),
        modelFile: file,
        mtlFile: mtlFile ?? null,
        textures,
      };
    });

  // Images not referenced by any model → standalone texture assets.
  const textures = files
    .filter((f) => IMAGE_EXT.has(byName.get(f).ext.toLowerCase()) && !used.has(f))
    .map((file) => ({
      id: byName.get(file).name,
      name: byName.get(file).name,
      type: 'texture',
      source: 'builtin',
      format: byName.get(file).ext.slice(1).toLowerCase(),
      textures: [file],
    }));

  return { assets: [...models, ...textures] };
}

function main() {
  const manifest = buildManifest();
  writeFileSync(join(ASSETS_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`[assets] manifest.json written — ${manifest.assets.length} assets`);
}

// Run when invoked directly (not when imported by tests).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
