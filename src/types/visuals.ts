// Visual/rendering types: per-mesh PBR materials and the scene-wide rendering
// pipeline config. Split out of the main types barrel to keep it small; all are
// re-exported from `@/types`, so consumers import from there as before.

/**
 * Surface material for a primitive mesh. Optional and additive: when absent the
 * mesh falls back to the flat `color`. In 3D, `shading: 'pbr'` (the default)
 * renders a physically-based surface (metallic/roughness + texture maps) that
 * reacts to the lighting pipeline; `'standard'` keeps the simple lit look. 2D
 * meshes and trigger volumes ignore this and stay unlit.
 */
export interface MaterialConfig {
  /** PBR (default in 3D) or the legacy flat StandardMaterial look. */
  shading: 'standard' | 'pbr';
  /** Metalness 0–1 (PBR). */
  metallic: number;
  /** Roughness 0–1 (PBR); 1 = fully matte. */
  roughness: number;
  /** Emissive color (hex), or undefined for none. */
  emissive?: string;
  /** Emissive strength multiplier. */
  emissiveIntensity?: number;
  /** Opacity 0–1. */
  alpha?: number;
  // Texture maps — each is the served URL of a texture file (rootUrl + filename).
  // The mesh's `color` is the base/albedo tint (used as white when a baseColorMap
  // is present so the texture shows its true colors).
  baseColorMap?: string;
  normalMap?: string;
  /** Grayscale roughness map (CC0 sets ship roughness/metalness separately). */
  roughnessMap?: string;
  aoMap?: string;
  emissiveMap?: string;
}

/** Default PBR material seeded when a user first opens the material editor: a
 *  matte surface (no metalness). The mesh's `color` provides the base tint. */
export function defaultMaterial(): MaterialConfig {
  return { shading: 'pbr', metallic: 0, roughness: 1 };
}

/** A named, reusable material (a full MaterialConfig) saved at the game level —
 *  e.g. an imported CC0 material or one captured from a mesh. Applied to any mesh
 *  in one click from the Inspector. The mesh's own `color` still tints it. */
export interface MaterialPreset {
  id: string;
  name: string;
  material: MaterialConfig;
}

/** Tone-mapping curve applied by the image-processing pass. `none` is the raw
 *  linear look; `aces` is the filmic curve used by most modern game engines. */
export type ToneMapping = 'none' | 'standard' | 'aces';

/** Shadow map resolution (px). Higher = crisper shadows, more GPU cost. */
export type ShadowQuality = 512 | 1024 | 2048;

/** Shadow edge style: `hard` = crisp, `soft` = uniform PCF blur, `contact` =
 *  contact-hardening (sharp where objects meet, softening with distance — the
 *  premium "PCSS" look; directional/spot lights only, PCF fallback otherwise). */
export type ShadowType = 'hard' | 'soft' | 'contact';

/**
 * Scene-wide, high-quality rendering configuration: the post-processing pipeline
 * (tone mapping, bloom, anti-aliasing, ambient occlusion, vignette/grain),
 * dynamic shadows, and the image-based-lighting environment. Applies in 3D mode
 * only — 2D games keep their flat, unlit look. Persisted with the game design doc.
 */
export interface RenderSettings {
  /** Master switch for the post-processing pipeline (3D only). */
  enabled: boolean;
  /** Image-processing tone-mapping curve. */
  tone: ToneMapping;
  /** Exposure multiplier applied before tone mapping. */
  exposure: number;
  /** Post-tone contrast. */
  contrast: number;
  /** Bloom (glow on bright areas). */
  bloom: boolean;
  bloomIntensity: number;
  /** Fast-approximate anti-aliasing. */
  fxaa: boolean;
  /** Screen-space ambient occlusion (contact shadows / depth). */
  ssao: boolean;
  ssaoIntensity: number;
  /** Darkened screen edges. */
  vignette: boolean;
  /** Film grain. */
  grain: boolean;
  /** Dynamic shadows cast by directional/point lights. */
  shadows: boolean;
  shadowQuality: ShadowQuality;
  /** Shadow edge style (hard / soft / contact-hardening). */
  shadowType: ShadowType;
  /** Edge softness 0–1: PCF sample quality and contact-hardening penumbra width. */
  shadowSoftness: number;
  /** Shadow opacity 0–1 (1 = fully dark). */
  shadowDarkness: number;
  /** Depth bias — raise to remove shadow acne, lower to reduce peter-panning. */
  shadowBias: number;
  /** Normal-offset bias — helps acne on grazing-angle surfaces. */
  shadowNormalBias: number;
  /** Image-based-lighting environment: a URL to a `.env`/`.dds`/`.hdr` cube, or
   *  empty for none. Drives reflections + ambient light. */
  environmentUrl: string;
  /** Ambient/reflection strength from the environment. */
  environmentIntensity: number;
  /** Render the environment as a background skybox. */
  skybox: boolean;
}

/** Sensible high-quality defaults: filmic tone mapping, soft bloom, AA and
 *  shadows on; SSAO and vignette/grain off by default (heavier / stylistic). */
export function defaultRenderSettings(): RenderSettings {
  return {
    enabled: true,
    tone: 'aces',
    exposure: 1,
    contrast: 1,
    bloom: true,
    bloomIntensity: 0.25,
    fxaa: true,
    ssao: false,
    ssaoIntensity: 1,
    vignette: false,
    grain: false,
    shadows: true,
    shadowQuality: 1024,
    shadowType: 'soft',
    shadowSoftness: 0.5,
    shadowDarkness: 0.85,
    shadowBias: 0.0008,
    shadowNormalBias: 0.02,
    environmentUrl: '',
    environmentIntensity: 1,
    skybox: false,
  };
}
