import type { Vec3, CustomGeometry } from './index';

// Asset library types (3D models & textures). Split out of the main types barrel and
// re-exported from `@/types`; import these from `@/types` as usual.

/** Default scale/rotation applied whenever a model asset is loaded into a scene
 *  or preview. `recenter` moves the model's pivot to its bounding-box center;
 *  `normalizeSize` scales it so its largest dimension is ~1 unit before `scale`. */
export interface ImportTransform {
  scale: Vec3;
  rotationDeg: Vec3;
  recenter: boolean;
  normalizeSize: boolean;
}

/** Material overrides applied on top of the model's own materials. */
export interface AssetMaterial {
  /** Tint/base color override (hex), or undefined to keep the model's material. */
  colorHex?: string;
  /** Render both faces (disable back-face culling) — fixes inside-out / thin meshes. */
  doubleSided?: boolean;
  /** Maps a material/submesh name → a texture filename from `textures`. */
  mapAssignments?: Record<string, string>;
}

/** One library asset: a 3D model (with optional material + textures), a texture, or an audio clip. */
export interface Asset {
  id: string;
  name: string;
  type: 'model' | 'texture' | 'audio';
  /** 'builtin' = shipped in public/assets (from manifest.json); 'uploaded' = user import;
   *  'generated' = built in-app by the Modeling Studio (geometry stored inline). */
  source: 'builtin' | 'uploaded' | 'generated';
  /** File extension/format, e.g. 'obj' | 'gltf' | 'glb' | 'png' | 'mesh' (generated). */
  format: string;
  /** Inline baked geometry for a `source: 'generated'` model (no file to load). */
  geometry?: CustomGeometry;
  /** URL prefix the files are served from. Built-ins default to '/assets/';
   *  uploaded assets use '/uploads/'. */
  rootUrl?: string;
  /** Model file name (relative to the asset root URL). Absent for pure textures. */
  modelFile?: string;
  /** Sibling material file (OBJ), if any. */
  mtlFile?: string | null;
  /** Texture file names this asset uses. */
  textures: string[];
  importTransform?: ImportTransform;
  material?: AssetMaterial;
  tags?: string[];
  notes?: string;
  /** True if the loaded model exposes animation groups (glTF/GLB); OBJ is always false. */
  hasAnimations?: boolean;
  animationNames?: string[];
}

export interface AssetLibrary {
  assets: Asset[];
}

export function emptyAssetLibrary(): AssetLibrary {
  return { assets: [] };
}

/** The default import transform — identity scale/rotation, no recenter/normalize. */
export function defaultImportTransform(): ImportTransform {
  return { scale: { x: 1, y: 1, z: 1 }, rotationDeg: { x: 0, y: 0, z: 0 }, recenter: false, normalizeSize: false };
}
