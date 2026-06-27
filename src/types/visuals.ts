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
  /** PBR (default in 3D), the legacy flat StandardMaterial look, or `foliage` —
   *  a PBR surface with vertex wind sway + fresnel rim glow (the stylized
   *  "neon grass" look). */
  shading: 'standard' | 'pbr' | 'foliage';
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
  /** Foliage shading tuning (only used when `shading: 'foliage'`). */
  foliage?: FoliageConfig;
}

/** Wind + rim-glow parameters for the stylized foliage material. */
export interface FoliageConfig {
  /** Horizontal sway distance at the blade tip (world units). */
  windStrength: number;
  /** Sway oscillation speed. */
  windSpeed: number;
  /** Fresnel rim glow colour (hex). */
  rimColor: string;
  /** Rim glow strength (added to emissive at grazing angles). */
  rimIntensity: number;
}

/** Default foliage tuning: a gentle sway and a soft green rim. */
export function defaultFoliage(): FoliageConfig {
  return { windStrength: 0.12, windSpeed: 1.6, rimColor: '#7dff8a', rimIntensity: 0.6 };
}

/**
 * A scattered grass field grown over a host mesh's surface (typically terrain).
 * Renders as thin-instanced blades (one draw call) using the foliage material, so
 * thousands of blades stay cheap. Stored on the host's MeshConfig (`mesh.grass`)
 * so it persists and rebuilds with the terrain.
 */
export interface GrassConfig {
  /** Blades per square world unit — drives the total blade count over the surface. */
  density: number;
  /** Blade height in world units (with per-blade jitter). */
  bladeHeight: number;
  /** Blade base width in world units. */
  bladeWidth: number;
  /** Base blade colour (hex). */
  color: string;
  /** Fresnel rim-glow colour (hex). */
  rimColor: string;
  /** Rim glow strength. */
  rimIntensity: number;
  /** Wind sway distance at the blade tip (world units). */
  windStrength: number;
  /** Wind oscillation speed. */
  windSpeed: number;
}

/** Balanced default grass: a full-but-smooth field of mid-green blades. */
export function defaultGrass(): GrassConfig {
  return {
    density: 8,
    bladeHeight: 0.7,
    bladeWidth: 0.12,
    color: '#3fa54a',
    rimColor: '#9dff7a',
    rimIntensity: 0.7,
    windStrength: 0.18,
    windSpeed: 1.8,
  };
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

/** Depth-of-field blur kernel quality (maps to DefaultRenderingPipeline.depthOfFieldBlurLevel). */
export type DofBlur = 'low' | 'medium' | 'high';

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
  /** Vignette strength (image-processing vignetteWeight; higher = darker edges). */
  vignetteWeight: number;
  /** Film grain. */
  grain: boolean;
  /** Film-grain strength (GrainPostProcess intensity). */
  grainIntensity: number;
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

  // ----- Color grade (image-processing ColorCurves) -----
  /** Global saturation, -100 (grayscale) … +100 (vivid); 0 = neutral. */
  saturation: number;
  /** Split-tone warmth, -1 (cool highlights / warm shadows) … +1 (warm highlights /
   *  cool "blue" shadows); 0 = neutral. Drives the cinematic teal-and-orange look. */
  warmth: number;

  // ----- Lens effects -----
  /** Chromatic aberration (RGB fringing toward the screen edges). */
  chromaticAberration: boolean;
  /** Aberration amount in pixels (~0–5 reads as subtle…strong). */
  chromaticAberrationAmount: number;
  /** Depth-of-field blur (subjects in focus, near/far blurred). */
  dof: boolean;
  /** Focus plane distance in millimetres (Babylon DOF unit). */
  dofFocusDistance: number;
  /** Aperture f-stop — lower = shallower focus (more blur). */
  dofFStop: number;
  /** Lens focal length in millimetres. */
  dofFocalLength: number;
  /** Blur kernel quality. */
  dofBlur: DofBlur;
  /** Edge sharpening (counteracts the softness from bloom/DOF/AA). */
  sharpen: boolean;
  /** Sharpen edge amount 0–1. */
  sharpenAmount: number;

  // ----- Camera -----
  /** Game-camera vertical field of view in degrees (wide-angle = larger). */
  fov: number;

  // ----- Volumetric light -----
  /** God rays / light shafts radiating from the scene's directional light. */
  godRays: boolean;
  /** God-ray exposure/intensity. */
  godRaysIntensity: number;

  /** Id of the look preset this matches (for gallery highlighting). Cleared to
   *  undefined whenever a setting is changed manually, so the gallery shows "Custom". */
  lookPreset?: string;
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
    vignetteWeight: 1.5,
    grain: false,
    grainIntensity: 15,
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
    saturation: 0,
    warmth: 0,
    chromaticAberration: false,
    chromaticAberrationAmount: 1,
    dof: false,
    dofFocusDistance: 8000,
    dofFStop: 2.8,
    dofFocalLength: 50,
    dofBlur: 'medium',
    sharpen: false,
    sharpenAmount: 0.3,
    fov: 45,
    godRays: false,
    godRaysIntensity: 0.6,
  };
}

/** Tone-mapping curve for the Modeling Studio viewport preview (mirrors RenderSettings.tone). */
export type StudioTone = 'none' | 'standard' | 'aces';

/**
 * Studio-only viewport preview settings: image-based environment lighting, key/fill light
 * levels, tone mapping, and the lit-PBR-preview toggle. These affect ONLY the Modeling
 * Studio's own Babylon viewport — they are not the game's RenderSettings and never touch the
 * game pipeline. Persisted in the project design doc so the Studio reopens as it was left.
 */
export interface StudioEnv {
  /** Environment (IBL) texture URL — an `.hdr` or prefiltered `.env`/`.dds`. Empty = none. */
  url: string;
  /** IBL strength multiplier (`scene.environmentIntensity`). */
  intensity: number;
  /** Render the environment as a background skybox. */
  skybox: boolean;
  /** Tone-mapping curve applied to the viewport. */
  tone: StudioTone;
  /** Exposure for the tone mapper. */
  exposure: number;
  /** Key directional-light intensity. */
  key: number;
  /** Hemispheric fill-light intensity. */
  fill: number;
  /** Render plain (material-less) meshes with the lit PBR material too (assigned materials
   *  always preview regardless). */
  litPreview: boolean;
}

export function defaultStudioEnv(): StudioEnv {
  return { url: '', intensity: 1, skybox: false, tone: 'aces', exposure: 1, key: 1.1, fill: 0.75, litPreview: false };
}
