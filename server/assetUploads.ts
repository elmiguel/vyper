import { Router } from 'express';
import multer from 'multer';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { unzipSync } from 'fflate';
import {
  type Cc0Provider,
  type Cc0Type,
  type MapField,
  type ResolvedMap,
  polyHavenListUrl,
  polyHavenFilesUrl,
  parsePolyHavenList,
  polyHavenMaterialMaps,
  polyHavenHdri,
  ambientCgListUrl,
  parseAmbientCgList,
  ambientCgZipUrl,
  ambientCgFieldFor,
  isImageFile,
} from './cc0.js';

/**
 * Runtime asset uploads, stored on disk (no DB). Files are written to UPLOAD_DIR
 * under their original basenames (so an OBJ's `mtllib`/`map_Kd` references still
 * resolve as siblings), served statically at /uploads, and catalogued in a
 * uploads.json manifest. Mirrors the built-in asset shape so the client merges
 * the two libraries transparently.
 */

const MODEL_EXT = new Set(['.obj', '.gltf', '.glb']);
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.ktx2']);
const AUDIO_EXT = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac']);
export const UPLOADS_URL = '/uploads/';

export interface UploadedAsset {
  id: string;
  name: string;
  type: 'model' | 'texture' | 'audio';
  source: 'uploaded';
  format: string;
  rootUrl: string;
  modelFile?: string;
  mtlFile?: string | null;
  /** Texture filenames (texture), or the single clip filename (audio). */
  textures: string[];
}

/**
 * Group an uploaded batch of filenames into asset records (pure). Each model file
 * becomes a model asset carrying its sibling `.mtl` and all image files in the
 * batch as textures; images not consumed by a model become standalone textures;
 * audio files always become standalone audio assets.
 */
export function buildUploadedAssets(files: string[]): UploadedAsset[] {
  const models = files.filter((f) => MODEL_EXT.has(extname(f).toLowerCase()));
  const images = files.filter((f) => IMAGE_EXT.has(extname(f).toLowerCase()));
  const audio = files.filter((f) => AUDIO_EXT.has(extname(f).toLowerCase()));
  const base = (f: string) => f.slice(0, f.length - extname(f).length);

  const modelAssets = models.map((file) => {
    const mtl = files.find((f) => f.toLowerCase() === `${base(file)}.mtl`.toLowerCase());
    return {
      id: base(file),
      name: base(file),
      type: 'model' as const,
      source: 'uploaded' as const,
      format: extname(file).slice(1).toLowerCase(),
      rootUrl: UPLOADS_URL,
      modelFile: file,
      mtlFile: mtl ?? null,
      textures: images,
    };
  });

  // Standalone textures only when no model claimed them.
  const textureAssets = models.length === 0
    ? images.map((file) => ({
        id: base(file),
        name: base(file),
        type: 'texture' as const,
        source: 'uploaded' as const,
        format: extname(file).slice(1).toLowerCase(),
        rootUrl: UPLOADS_URL,
        textures: [file],
      }))
    : [];

  const audioAssets = audio.map((file) => ({
    id: base(file),
    name: base(file),
    type: 'audio' as const,
    source: 'uploaded' as const,
    format: extname(file).slice(1).toLowerCase(),
    rootUrl: UPLOADS_URL,
    textures: [file],
  }));

  return [...modelAssets, ...textureAssets, ...audioAssets];
}

/** Files belonging to `target` that no other asset references — safe to delete
 *  from disk when `target` is removed. Pure (testable). */
export function orphanedFiles(target: UploadedAsset, remaining: UploadedAsset[]): string[] {
  const stillUsed = new Set<string>();
  for (const a of remaining) {
    if (a.modelFile) stillUsed.add(a.modelFile);
    if (a.mtlFile) stillUsed.add(a.mtlFile);
    for (const t of a.textures) stillUsed.add(t);
  }
  const own = [target.modelFile, target.mtlFile, ...target.textures].filter((f): f is string => !!f);
  return [...new Set(own)].filter((f) => !stillUsed.has(f));
}

/** Build the /api/assets router and return it plus the resolved upload directory. */
export function createAssetUploadRouter() {
  const uploadDir = process.env.ASSET_UPLOAD_DIR || join(process.cwd(), 'server', 'uploads');
  const metaPath = join(uploadDir, 'uploads.json');
  if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });

  const readMeta = (): UploadedAsset[] => {
    try {
      return JSON.parse(readFileSync(metaPath, 'utf8')) as UploadedAsset[];
    } catch {
      return [];
    }
  };
  const writeMeta = (list: UploadedAsset[]) => writeFileSync(metaPath, JSON.stringify(list, null, 2));

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => cb(null, basename(file.originalname)),
  });
  const upload = multer({ storage, limits: { fileSize: 64 * 1024 * 1024 } });

  /** Persist downloaded files as uploaded texture assets (idempotent by id). */
  const recordTextures = (filenames: string[]): UploadedAsset[] => {
    const fresh = filenames.map<UploadedAsset>((file) => ({
      id: file.slice(0, file.length - extname(file).length),
      name: file,
      type: 'texture',
      source: 'uploaded',
      format: extname(file).slice(1).toLowerCase(),
      rootUrl: UPLOADS_URL,
      textures: [file],
    }));
    const byId = new Map(readMeta().map((a) => [a.id, a]));
    for (const a of fresh) byId.set(a.id, a);
    writeMeta([...byId.values()]);
    return fresh;
  };

  const download = async (url: string): Promise<Buffer> => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`fetch ${url} → ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  };

  /** Download a set of resolved maps to disk; return the material URL mapping. */
  const writeMaps = async (maps: ResolvedMap[]): Promise<{ files: string[]; material: Partial<Record<MapField, string>> }> => {
    const files: string[] = [];
    const material: Partial<Record<MapField, string>> = {};
    for (const m of maps) {
      const file = basename(m.filename);
      writeFileSync(join(uploadDir, file), await download(m.url));
      files.push(file);
      material[m.field] = `${UPLOADS_URL}${file}`;
    }
    return { files, material };
  };

  const router = Router();
  router.get('/', (_req, res) => res.json({ assets: readMeta() }));
  router.post('/', upload.array('files', 32), (req, res) => {
    const names = ((req.files as Express.Multer.File[]) ?? []).map((f) => basename(f.originalname));
    const fresh = buildUploadedAssets(names);
    // Merge into the manifest, replacing any same-id records.
    const byId = new Map(readMeta().map((a) => [a.id, a]));
    for (const a of fresh) byId.set(a.id, a);
    writeMeta([...byId.values()]);
    res.status(201).json({ assets: fresh });
  });

  // ---- CC0 library (Poly Haven / ambientCG): browse + import to /uploads ----

  router.get('/cc0/catalog', async (req, res, next) => {
    try {
      const provider = req.query.provider as Cc0Provider;
      const type = (req.query.type as Cc0Type) ?? 'material';
      if (provider === 'ambientcg') {
        const json = (await (await fetch(ambientCgListUrl(80))).json()) as Parameters<typeof parseAmbientCgList>[0];
        res.json({ items: parseAmbientCgList(json) });
      } else {
        const json = (await (await fetch(polyHavenListUrl(type))).json()) as Parameters<typeof parsePolyHavenList>[0];
        res.json({ items: parsePolyHavenList(json, type) });
      }
    } catch (err) {
      next(err);
    }
  });

  router.post('/cc0/import', async (req, res, next) => {
    try {
      const { provider, id, type = 'material', res: resolution = '1k' } = req.body as {
        provider: Cc0Provider; id: string; type?: Cc0Type; res?: string;
      };
      if (!id) return res.status(400).json({ error: 'missing asset id' });

      if (provider === 'ambientcg') {
        const zip = await download(ambientCgZipUrl(id, resolution.toUpperCase(), 'JPG'));
        const entries = unzipSync(new Uint8Array(zip));
        const files: string[] = [];
        const material: Partial<Record<MapField, string>> = {};
        for (const [name, bytes] of Object.entries(entries)) {
          const field = ambientCgFieldFor(name);
          if (!field || !isImageFile(name)) continue;
          const file = basename(name);
          writeFileSync(join(uploadDir, file), Buffer.from(bytes));
          files.push(file);
          material[field] = `${UPLOADS_URL}${file}`;
        }
        return res.status(201).json({ assets: recordTextures(files), material });
      }

      // Poly Haven (direct file downloads — no archive).
      const filesJson = (await (await fetch(polyHavenFilesUrl(id))).json()) as Parameters<typeof polyHavenMaterialMaps>[0];
      if (type === 'hdri') {
        const hdr = polyHavenHdri(filesJson, resolution);
        if (!hdr) return res.status(404).json({ error: 'no HDRI file found' });
        writeFileSync(join(uploadDir, basename(hdr.filename)), await download(hdr.url));
        return res.status(201).json({ assets: [], environmentUrl: `${UPLOADS_URL}${basename(hdr.filename)}` });
      }
      const { files, material } = await writeMaps(polyHavenMaterialMaps(filesJson, resolution));
      res.status(201).json({ assets: recordTextures(files), material });
    } catch (err) {
      next(err);
    }
  });

  // Delete an uploaded asset: drop its manifest entry and remove any files it
  // owned that no remaining asset still references.
  router.delete('/:id', (req, res) => {
    const id = String(req.params.id);
    const meta = readMeta();
    const target = meta.find((a) => a.id === id);
    if (!target) return res.status(404).json({ error: 'asset not found' });
    const remaining = meta.filter((a) => a.id !== id);
    for (const f of orphanedFiles(target, remaining)) {
      try {
        rmSync(join(uploadDir, basename(f)));
      } catch {
        /* already gone */
      }
    }
    writeMeta(remaining);
    res.status(204).end();
  });

  return { router, uploadDir };
}
