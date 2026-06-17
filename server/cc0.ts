/**
 * CC0 asset providers — Poly Haven and ambientCG. Pure parsing/transform helpers
 * (no network, no fs) so they can be unit-tested against fixture JSON. The router
 * (assetUploads.ts) does the actual fetching, unzipping and disk writes.
 *
 * Both providers ship PBR materials as *separate* grayscale maps (color / normal
 * / roughness / AO), which map onto our MaterialConfig fields of the same name.
 */

export type Cc0Provider = 'polyhaven' | 'ambientcg';
export type Cc0Type = 'material' | 'hdri';

/** A catalogue entry shown in the browser before import. */
export interface Cc0Item {
  provider: Cc0Provider;
  id: string;
  name: string;
  type: Cc0Type;
  thumbUrl: string;
  categories: string[];
}

/** Our MaterialConfig texture-map field a provider map feeds. */
export type MapField = 'baseColorMap' | 'normalMap' | 'roughnessMap' | 'aoMap';

/** One downloadable texture file resolved for import. */
export interface ResolvedMap {
  field: MapField;
  url: string;
  filename: string;
}

// ----------------------------- Poly Haven -----------------------------

const PH_API = 'https://api.polyhaven.com';
const PH_TYPE: Record<Cc0Type, string> = { material: 'textures', hdri: 'hdris' };

export function polyHavenListUrl(type: Cc0Type): string {
  return `${PH_API}/assets?type=${PH_TYPE[type]}`;
}
export function polyHavenFilesUrl(id: string): string {
  return `${PH_API}/files/${id}`;
}

/** Parse the `/assets` map (keyed by id) into catalogue items. */
export function parsePolyHavenList(json: Record<string, { name?: string; categories?: string[] }>, type: Cc0Type): Cc0Item[] {
  return Object.entries(json).map(([id, a]) => ({
    provider: 'polyhaven' as const,
    id,
    name: a.name ?? id,
    type,
    thumbUrl: `https://cdn.polyhaven.com/asset_img/thumbs/${id}.png?width=256&height=256`,
    categories: a.categories ?? [],
  }));
}

// Poly Haven `/files/<id>` map-name → our material field.
const PH_MAP_FIELD: Record<string, MapField> = {
  Diffuse: 'baseColorMap',
  Color: 'baseColorMap',
  albedo: 'baseColorMap',
  nor_gl: 'normalMap',
  Normal: 'normalMap',
  Rough: 'roughnessMap',
  Roughness: 'roughnessMap',
  AO: 'aoMap',
};

type PhFileLeaf = { url?: string };
type PhFiles = Record<string, Record<string, Record<string, PhFileLeaf>>>;

/** Resolve a Poly Haven texture set's maps at a resolution, preferring jpg. */
export function polyHavenMaterialMaps(files: PhFiles, res: string): ResolvedMap[] {
  const out: ResolvedMap[] = [];
  for (const [mapName, field] of Object.entries(PH_MAP_FIELD)) {
    const byRes = files[mapName];
    const leaf = byRes?.[res] ?? byRes?.['1k'] ?? Object.values(byRes ?? {})[0];
    if (!leaf) continue;
    const fmt = leaf.jpg ?? leaf.png ?? Object.values(leaf)[0];
    if (!fmt?.url) continue;
    out.push({ field, url: fmt.url, filename: filenameFromUrl(fmt.url) });
  }
  // Dedupe fields (first match wins, e.g. Diffuse over Color).
  const seen = new Set<MapField>();
  return out.filter((m) => (seen.has(m.field) ? false : (seen.add(m.field), true)));
}

/** Resolve a Poly Haven HDRI download URL (prefers hdr) at a resolution. */
export function polyHavenHdri(files: PhFiles, res: string): { url: string; filename: string } | null {
  const byRes = (files as unknown as { hdri?: Record<string, Record<string, PhFileLeaf>> }).hdri;
  const leaf = byRes?.[res] ?? byRes?.['1k'] ?? Object.values(byRes ?? {})[0];
  const fmt = leaf?.hdr ?? Object.values(leaf ?? {})[0];
  if (!fmt?.url) return null;
  return { url: fmt.url, filename: filenameFromUrl(fmt.url) };
}

// ----------------------------- ambientCG -----------------------------

const ACG_API = 'https://ambientcg.com/api/v2/full_json';

export function ambientCgListUrl(limit = 60): string {
  // `imageData` adds per-asset preview thumbnail URLs we can render directly.
  return `${ACG_API}?type=Material&limit=${limit}&include=displayData,imageData`;
}

/** The ambientCG preview thumbnail block: `{ "256-PNG": url, ... }` keyed by size. */
type AcgPreview = Record<string, string> | undefined;

/** Pick a usable thumbnail URL from an asset's preview block (prefer a ~256px one). */
export function ambientCgThumb(preview: AcgPreview): string {
  if (!preview) return '';
  const keys = Object.keys(preview);
  const at256 = keys.find((k) => k.includes('256')) ?? keys.find((k) => k.includes('128'));
  return preview[at256 ?? keys[0]] ?? '';
}

export function parseAmbientCgList(json: { foundAssets?: Array<{ assetId?: string; displayName?: string; displayCategories?: string; previewImage?: AcgPreview }> }): Cc0Item[] {
  return (json.foundAssets ?? [])
    .filter((a) => a.assetId)
    .map((a) => ({
      provider: 'ambientcg' as const,
      id: a.assetId!,
      name: a.displayName ?? a.assetId!,
      type: 'material' as const,
      thumbUrl:
        ambientCgThumb(a.previewImage) ||
        `https://acg-media.struffelproductions.com/file/ambientCG-Web/media/thumbnail/256-PNG/${a.assetId}.png`,
      categories: a.displayCategories ? a.displayCategories.split('/') : [],
    }));
}

/** ambientCG download archive, e.g. `Rock023_1K-JPG.zip`. */
export function ambientCgZipUrl(id: string, res = '1K', fmt = 'JPG'): string {
  return `https://ambientcg.com/get?file=${id}_${res}-${fmt}.zip`;
}

// ambientCG file-name suffix → our material field (e.g. `Rock023_1K-JPG_Color.jpg`).
const ACG_SUFFIX_FIELD: Array<[RegExp, MapField]> = [
  [/_Color\./i, 'baseColorMap'],
  [/_NormalGL\./i, 'normalMap'],
  [/_Roughness\./i, 'roughnessMap'],
  [/_AmbientOcclusion\./i, 'aoMap'],
];

/** Classify an extracted ambientCG file by its channel suffix, or null to skip. */
export function ambientCgFieldFor(filename: string): MapField | null {
  for (const [re, field] of ACG_SUFFIX_FIELD) if (re.test(filename)) return field;
  return null;
}

// ----------------------------- shared -----------------------------

/** Last path segment of a URL, without query string. */
export function filenameFromUrl(url: string): string {
  const path = url.split('?')[0];
  return path.slice(path.lastIndexOf('/') + 1);
}

/** Allow only image files we serve, to avoid writing arbitrary archive content. */
export function isImageFile(name: string): boolean {
  return /\.(png|jpe?g|webp|bmp|ktx2)$/i.test(name);
}
