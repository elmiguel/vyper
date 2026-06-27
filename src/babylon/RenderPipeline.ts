import type { Scene } from '@babylonjs/core/scene';
import type { Camera } from '@babylonjs/core/Cameras/camera';
import type { Light } from '@babylonjs/core/Lights/light';
import type { IShadowLight } from '@babylonjs/core/Lights/shadowLight';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import type { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
import { SSAO2RenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline';
import { DepthOfFieldEffectBlurLevel } from '@babylonjs/core/PostProcesses/depthOfFieldEffect';
import { VolumetricLightScatteringPostProcess } from '@babylonjs/core/PostProcesses/volumetricLightScatteringPostProcess';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration';
import { ColorCurves } from '@babylonjs/core/Materials/colorCurves';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { CubeTexture } from '@babylonjs/core/Materials/Textures/cubeTexture';
import { HDRCubeTexture } from '@babylonjs/core/Materials/Textures/hdrCubeTexture';
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
// Side effects required by the tree-shaken core build.
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import '@babylonjs/core/Rendering/prePassRendererSceneComponent';
import '@babylonjs/core/Rendering/geometryBufferRendererSceneComponent';
// Depth-of-field's circle-of-confusion needs a scene depth texture; without the
// prepass it falls back to scene.enableDepthRenderer(), which this registers.
import '@babylonjs/core/Rendering/depthRendererSceneComponent';

import type { RenderSettings } from '@/types';
import { defaultRenderSettings } from '@/types';
import { DEFAULT_LAYER } from './editorObjects';

/** Filtering strategy + tuned values for a ShadowGenerator, derived from settings.
 *  Pure (no Babylon) so it's unit-testable; the controller maps it onto a generator. */
export interface ShadowParams {
  filter: 'none' | 'pcf' | 'pcss';
  /** PCF/PCSS sample quality. */
  quality: 'low' | 'medium' | 'high';
  /** Contact-hardening penumbra width (UV ratio of the light size). */
  lightSizeUVRatio: number;
  /** ShadowGenerator.setDarkness arg: 0 = fully black, 1 = no shadow. */
  darkness: number;
  bias: number;
  normalBias: number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Map render settings to concrete shadow-generator parameters. */
export function shadowParamsFrom(s: RenderSettings): ShadowParams {
  const filter = s.shadowType === 'hard' ? 'none' : s.shadowType === 'contact' ? 'pcss' : 'pcf';
  const soft = clamp01(s.shadowSoftness);
  const quality = soft >= 0.66 ? 'high' : soft >= 0.33 ? 'medium' : 'low';
  return {
    filter,
    quality,
    lightSizeUVRatio: 0.005 + soft * 0.075, // ~0.005 (crisp) … 0.08 (wide penumbra)
    darkness: 1 - clamp01(s.shadowDarkness),
    bias: s.shadowBias,
    normalBias: s.shadowNormalBias,
  };
}

/** Which Babylon light classes can cast dynamic shadows (hemispheric cannot). */
export function castsShadows(className: string | undefined): boolean {
  return className === 'DirectionalLight' || className === 'PointLight' || className === 'SpotLight';
}

/** A scene object that may own a mesh and/or a light (SceneManager's tracked slot). */
export interface ShadowSlot {
  mesh?: AbstractMesh;
  light?: Light;
}

/** Split tracked scene slots into shadow-casting lights and geometry casters.
 *  Casters are game meshes (DEFAULT_LAYER, with geometry) plus their children;
 *  editor helpers and trigger wireframes (EDITOR_LAYER) are excluded. */
export function collectShadowTargets(slots: Iterable<ShadowSlot>): { lights: Light[]; casters: AbstractMesh[] } {
  const lights: Light[] = [];
  const casters: AbstractMesh[] = [];
  const addCaster = (m: AbstractMesh) => {
    if (m.layerMask === DEFAULT_LAYER && m.getTotalVertices() > 0) casters.push(m);
  };
  for (const t of slots) {
    if (t.light && castsShadows(t.light.getClassName())) lights.push(t.light);
    if (t.mesh) {
      addCaster(t.mesh);
      for (const child of t.mesh.getChildMeshes(false)) addCaster(child);
    }
  }
  return { lights, casters };
}

const TONE_MAP: Record<RenderSettings['tone'], number> = {
  none: ImageProcessingConfiguration.TONEMAPPING_STANDARD, // unused when toneMapping disabled
  standard: ImageProcessingConfiguration.TONEMAPPING_STANDARD,
  aces: ImageProcessingConfiguration.TONEMAPPING_ACES,
};

const DOF_BLUR: Record<RenderSettings['dofBlur'], DepthOfFieldEffectBlurLevel> = {
  low: DepthOfFieldEffectBlurLevel.Low,
  medium: DepthOfFieldEffectBlurLevel.Medium,
  high: DepthOfFieldEffectBlurLevel.High,
};

const clampSym = (v: number, lim: number) => (v < -lim ? -lim : v > lim ? lim : v);

/**
 * Build an image-processing ColorCurves from the grade settings. Pure (no live
 * Babylon state) so it's unit-testable. `saturation` drives global saturation;
 * `warmth` (-1…1) applies a complementary split-tone — warm highlights + cool
 * "blue" shadows when positive, the reverse when negative — the teal-and-orange
 * cinematic look. A warmth of 0 leaves hue/shadow tinting untouched.
 */
/** Populate a ColorCurves from the grade settings (mutates `cc`). All fields are set
 *  every call — including resetting the split-tone to 0 when warmth is 0 — so going
 *  from a tinted look back to neutral fully clears the tint. */
function populateColorCurves(cc: ColorCurves, s: RenderSettings): ColorCurves {
  cc.globalSaturation = clampSym(s.saturation, 100);
  const w = clampSym(s.warmth, 1);
  const warmHue = 32; // orange
  const coolHue = 210; // blue
  const sat = Math.abs(w) * 45;
  cc.highlightsHue = w >= 0 ? warmHue : coolHue;
  cc.highlightsSaturation = w === 0 ? 0 : sat;
  cc.shadowsHue = w >= 0 ? coolHue : warmHue;
  cc.shadowsSaturation = w === 0 ? 0 : sat;
  return cc;
}

export function colorCurvesFrom(s: RenderSettings): ColorCurves {
  return populateColorCurves(new ColorCurves(), s);
}

/**
 * Apply every per-camera DefaultRenderingPipeline effect from the settings. Shared
 * by the live scene pipeline and the Game-Style preview pipelines (one per preset
 * card) so both render an identical grade. Assumes `s.enabled` is already true.
 */
export function configureDefaultPipeline(p: DefaultRenderingPipeline, s: RenderSettings): void {
  // ── ORDER MATTERS ──
  // Each `*Enabled` flag and `samples` setter calls the pipeline's _buildPipeline(),
  // which rebuilds the post-process chain. If the image-processing grade (tone map,
  // colour curves) is configured BEFORE those toggles, a subsequent rebuild leaves
  // it enabled-but-unbound — which renders the whole frame GRAYSCALE until something
  // forces another rebuild (e.g. toggling grain). So: do every rebuild-triggering
  // toggle FIRST, then configure image processing LAST, where nothing can clobber it.

  // 1) MSAA + chain toggles. (bloom/grain/chromaticAberration are always allocated;
  //    sharpen/DOF objects exist once their flag is on — set sub-params after.)
  p.samples = 4; // 4× MSAA — FXAA alone leaves crawling edges on a sharp PBR scene.
  p.imageProcessingEnabled = true;
  p.bloomEnabled = s.bloom;
  p.fxaaEnabled = s.fxaa;
  p.grainEnabled = s.grain;
  p.chromaticAberrationEnabled = s.chromaticAberration;
  p.sharpenEnabled = s.sharpen;
  p.depthOfFieldEnabled = s.dof;

  // 2) Per-effect parameters (the post-process objects now exist for what's enabled).
  p.bloomWeight = s.bloomIntensity;
  if (s.grain) p.grain.intensity = s.grainIntensity;
  if (s.chromaticAberration) {
    p.chromaticAberration.aberrationAmount = s.chromaticAberrationAmount;
    p.chromaticAberration.radialIntensity = 1.2;
  }
  if (s.sharpen) p.sharpen.edgeAmount = s.sharpenAmount;
  if (s.dof) {
    p.depthOfFieldBlurLevel = DOF_BLUR[s.dofBlur];
    p.depthOfField.focusDistance = s.dofFocusDistance;
    p.depthOfField.fStop = s.dofFStop;
    p.depthOfField.focalLength = s.dofFocalLength;
  }

  // 3) Image processing LAST. These set values / recompile only the image-processing
  //    pass (not a full chain rebuild), so the grade can't be wiped after this point.
  const ip = p.imageProcessing;
  ip.toneMappingEnabled = s.tone !== 'none';
  ip.toneMappingType = TONE_MAP[s.tone];
  ip.exposure = s.exposure;
  ip.contrast = s.contrast;
  ip.vignetteEnabled = s.vignette;
  ip.vignetteWeight = s.vignetteWeight;
  // Reuse + mutate the existing ColorCurves so the already-bound object updates in
  // place (a fresh object each call risks the post-process binding a stale one).
  const cc = ip.colorCurves ?? new ColorCurves();
  populateColorCurves(cc, s);
  ip.colorCurves = cc;
  ip.colorCurvesEnabled = true;
}

/**
 * Owns the scene-wide post-processing pipeline (tone mapping, bloom, FXAA,
 * SSAO, vignette/grain), dynamic shadows, and the IBL environment for a 3D
 * scene. Attached to both the editor and game cameras so the preview matches
 * the game. A no-op in 2D mode (the manager simply never constructs one).
 */
export class RenderPipeline {
  private pipeline?: DefaultRenderingPipeline;
  private ssao?: SSAO2RenderingPipeline;
  private shadows = new ShadowController();
  private godRays: GodRayController;
  private environment?: BaseTexture;
  private skybox?: AbstractMesh;
  private lastEnvUrl = '';

  constructor(
    private readonly scene: Scene,
    private readonly cameras: Camera[],
  ) {
    this.godRays = new GodRayController(scene, cameras);
  }

  /** Reconcile every effect with the current settings. Cheap to call repeatedly. */
  apply(s: RenderSettings) {
    if (!s.enabled) {
      this.teardownPostProcessing();
      this.shadows.setConfig(s, false);
      this.godRays.setConfig(s, false);
      void this.applyEnvironment('', s);
      return;
    }
    this.applyDefaultPipeline(s);
    this.applySsao(s);
    this.shadows.setConfig(s);
    this.godRays.setConfig(s);
    void this.applyEnvironment(s.environmentUrl, s);
  }

  /**
   * Mute/unmute all camera post-processing on the LIVE pipeline by flipping its
   * effect flags — without disposing or detaching anything. Disposing or
   * per-camera detaching the pipeline mid-frame destabilizes the multi-view
   * render loop (black screen / frozen viewport), so the editor-effects toggle
   * uses this instead. Shadows + IBL are scene lighting (not camera effects) and
   * are left untouched. `s` is the real render settings to restore when unmuted.
   */
  setEffectsMuted(muted: boolean, s: RenderSettings) {
    const p = this.pipeline;
    if (p) {
      p.bloomEnabled = muted ? false : s.bloom;
      p.grainEnabled = muted ? false : s.grain;
      p.fxaaEnabled = muted ? false : s.fxaa;
      p.chromaticAberrationEnabled = muted ? false : s.chromaticAberration;
      p.sharpenEnabled = muted ? false : s.sharpen;
      p.depthOfFieldEnabled = muted ? false : s.dof;
      const ip = p.imageProcessing;
      ip.toneMappingEnabled = muted ? false : s.tone !== 'none';
      ip.vignetteEnabled = muted ? false : s.vignette;
      ip.colorCurvesEnabled = !muted;
      ip.exposure = muted ? 1 : s.exposure;
      ip.contrast = muted ? 1 : s.contrast;
    }
    if (this.ssao) this.ssao.totalStrength = muted ? 0 : s.ssaoIntensity;
  }

  private applyDefaultPipeline(s: RenderSettings) {
    if (!this.pipeline) {
      this.pipeline = new DefaultRenderingPipeline('hq', true, this.scene, this.cameras);
    }
    configureDefaultPipeline(this.pipeline, s);
  }

  private applySsao(s: RenderSettings) {
    const supported = SSAO2RenderingPipeline.IsSupported;
    if (!s.ssao || !supported) {
      this.ssao?.dispose();
      this.ssao = undefined;
      return;
    }
    if (!this.ssao) {
      // 0.75× AO resolution with a full-res bilateral blur reads far cleaner than the old
      // half-res/half-blur setup (which looked blocky and noisy). 16 samples + expensiveBlur
      // remove the speckle; the cost is acceptable for an editor/lookdev viewport.
      this.ssao = new SSAO2RenderingPipeline('hq-ssao', this.scene, { ssaoRatio: 0.75, blurRatio: 1 }, this.cameras);
      this.ssao.samples = 16;
      this.ssao.expensiveBlur = true;
      this.ssao.bilateralSamples = 12;
      // Tight radius (scene units ~1–2) keeps AO as contact shadows in creases rather than wide
      // dark halos around whole objects; `base` lifts it off pure black so it's a subtle dirtying.
      this.ssao.radius = 0.6;
      this.ssao.base = 0.15;
      this.ssao.minZAspect = 0.2;
      this.ssao.maxZ = 200;
    }
    this.ssao.totalStrength = s.ssaoIntensity;
  }

  /** Load (or clear) the IBL environment + optional skybox. Async; safe to await-less. */
  private async applyEnvironment(url: string, s: RenderSettings) {
    this.scene.environmentIntensity = s.environmentIntensity;
    if (url === this.lastEnvUrl) {
      if (this.skybox) this.skybox.setEnabled(!!url && s.skybox);
      return;
    }
    this.lastEnvUrl = url;
    this.environment?.dispose();
    this.environment = undefined;
    this.skybox?.dispose();
    this.skybox = undefined;
    if (this.scene.environmentTexture) this.scene.environmentTexture = null;
    if (!url) return;

    // `.hdr` equirectangular maps load via HDRCubeTexture; `.env`/`.dds` are
    // prefiltered cubes loaded directly.
    const tex = /\.hdr($|\?)/i.test(url)
      ? new HDRCubeTexture(url, this.scene, 256)
      : CubeTexture.CreateFromPrefilteredData(url, this.scene);
    this.environment = tex;
    this.scene.environmentTexture = tex;
    if (s.skybox) {
      this.skybox = this.scene.createDefaultSkybox(tex, true, 1000, 0.3) ?? undefined;
    }
  }

  /** Refresh shadow casters/receivers from the scene's tracked slots. Called
   *  after each scene sync and whenever settings change. */
  syncShadows(slots: Iterable<ShadowSlot>) {
    const { lights, casters } = collectShadowTargets(slots);
    this.shadows.sync(lights, casters);
    // God rays radiate from the scene's directional light; refresh the source
    // position whenever the lights change (the light may have moved/rotated).
    this.godRays.setSunLight(lights.find((l) => l.getClassName() === 'DirectionalLight'));
  }

  /** Shadows re-render every frame while playing (moving objects) and on-demand
   *  while editing. Call on Play start/stop. */
  setShadowsLive(live: boolean) {
    this.shadows.setLive(live);
  }

  private teardownPostProcessing() {
    this.pipeline?.dispose();
    this.pipeline = undefined;
    this.ssao?.dispose();
    this.ssao = undefined;
  }

  /** Last-resort recovery: drop the post-processing pipelines so the raw scene keeps rendering.
   *  Called by the render loop only after sustained post-process failures (see renderFrameSafely);
   *  shadows + IBL are scene lighting and are left intact. */
  recoverByDisablingEffects() {
    this.teardownPostProcessing();
  }

  dispose() {
    this.teardownPostProcessing();
    this.shadows.dispose();
    this.godRays.dispose();
    this.environment?.dispose();
    this.skybox?.dispose();
  }
}

/**
 * Owns the volumetric light-scattering ("god ray") post-process. One VLS instance
 * is attached per camera (they cannot be shared), all pointing at a single shared
 * emissive "sun" billboard placed far along the directional light's reverse
 * direction. A no-op until both god rays are enabled AND the scene has a
 * directional light; reconciles whenever either input changes.
 */
class GodRayController {
  private vls = new Map<Camera, VolumetricLightScatteringPostProcess>();
  private sun?: Mesh;
  private light?: IShadowLight;
  private enabled = false;
  private intensity = 0.6;
  /** Distance to push the sun billboard along the light's reverse direction. */
  private static readonly SUN_DISTANCE = 400;

  constructor(
    private readonly scene: Scene,
    private readonly cameras: Camera[],
  ) {}

  setConfig(s: RenderSettings, enabled = s.godRays) {
    this.enabled = enabled;
    this.intensity = s.godRaysIntensity;
    this.reconcile();
  }

  setSunLight(light: Light | undefined) {
    this.light = light as IShadowLight | undefined;
    this.reconcile();
  }

  private reconcile() {
    if (!this.enabled || !this.light) {
      this.teardown();
      return;
    }
    if (!this.sun) {
      // `null` mesh → VLS builds its default emissive billboard; reuse the first
      // one as the shared sun and feed it to the other cameras.
      const first = this.cameras[0];
      const vls = new VolumetricLightScatteringPostProcess('godrays', 1, first, undefined, 80, undefined, this.scene.getEngine());
      this.sun = vls.mesh as Mesh;
      this.sun.isPickable = false;
      this.sun.layerMask = DEFAULT_LAYER;
      this.vls.set(first, vls);
      for (const cam of this.cameras.slice(1)) {
        this.vls.set(cam, new VolumetricLightScatteringPostProcess('godrays', 1, cam, this.sun, 80, undefined, this.scene.getEngine()));
      }
    }
    this.positionSun();
    for (const vls of this.vls.values()) {
      vls.exposure = 0.3 * this.intensity;
      vls.weight = 0.5 * this.intensity;
      vls.decay = 0.96815;
      vls.density = 0.926;
    }
  }

  /** Place the sun billboard far along the light's reverse direction (toward the
   *  source), so the rays appear to emanate from where the light comes from. */
  private positionSun() {
    if (!this.sun || !this.light) return;
    const dir = (this.light as unknown as { direction?: Vector3 }).direction;
    if (dir) {
      this.sun.position = dir.normalizeToNew().scale(-GodRayController.SUN_DISTANCE);
    }
  }

  private teardown() {
    for (const [cam, vls] of this.vls) vls.dispose(cam);
    this.vls.clear();
    this.sun?.dispose();
    this.sun = undefined;
  }

  dispose() {
    this.teardown();
  }
}

/**
 * Maintains one ShadowGenerator per shadow-casting light and keeps each
 * generator's render list in sync with the current caster meshes.
 */
const QUALITY_MAP: Record<ShadowParams['quality'], number> = {
  low: ShadowGenerator.QUALITY_LOW,
  medium: ShadowGenerator.QUALITY_MEDIUM,
  high: ShadowGenerator.QUALITY_HIGH,
};

/** RenderTargetTexture.refreshRate values (avoid importing the class just for these). */
const REFRESH_EVERY_FRAME = 1;
const REFRESH_ONCE = 0;

class ShadowController {
  private gens = new Map<Light, ShadowGenerator>();
  private enabled = false;
  private quality = 1024;
  private params: ShadowParams = shadowParamsFrom(defaultRenderSettings());
  /** While "live" (Play), shadow maps re-render every frame (objects move). While
   *  editing, the scene is mostly static, so they render once and only re-render
   *  when sync() runs (i.e. on an actual edit) — not 60×/sec for an idle scene. */
  private live = false;

  /** Apply render settings. Map resolution change forces a rebuild (it's fixed at
   *  creation); everything else (filter/softness/darkness/bias) is applied live. */
  setConfig(s: RenderSettings, enabled = s.shadows) {
    if (s.shadowQuality !== this.quality) {
      this.disposeAll();
      this.quality = s.shadowQuality;
    }
    this.enabled = enabled;
    this.params = shadowParamsFrom(s);
    if (!enabled) this.disposeAll();
  }

  sync(lights: Light[], casters: AbstractMesh[]) {
    if (!this.enabled) return;
    // Drop generators whose light is gone.
    for (const [light, gen] of this.gens) {
      if (!lights.includes(light)) {
        gen.dispose();
        this.gens.delete(light);
      }
    }
    // Create generators for new lights, then (re)configure + point at the casters.
    for (const light of lights) {
      if (!this.gens.has(light)) this.gens.set(light, this.make(light));
    }
    for (const [light, gen] of this.gens) {
      this.configure(gen, light);
      const map = gen.getShadowMap();
      if (map) {
        map.renderList = [...casters];
        this.applyRefresh(map);
      }
    }
    for (const c of casters) c.receiveShadows = true;
  }

  /** Switch shadow re-render cadence: every frame while playing, on-demand (once
   *  per sync) while editing. Re-applies to all existing shadow maps. */
  setLive(live: boolean): void {
    this.live = live;
    for (const gen of this.gens.values()) {
      const map = gen.getShadowMap();
      if (map) this.applyRefresh(map);
    }
  }

  private applyRefresh(map: { refreshRate: number; resetRefreshCounter: () => void }): void {
    if (this.live) {
      map.refreshRate = REFRESH_EVERY_FRAME;
    } else {
      // Render once now (reflecting this edit), then idle until the next sync.
      map.refreshRate = REFRESH_ONCE;
      map.resetRefreshCounter();
    }
  }

  private make(light: Light): ShadowGenerator {
    const gen = new ShadowGenerator(this.quality, light as unknown as IShadowLight);
    // Tighter directional shadow bounds → crisper contact + better penumbra scaling.
    (light as { autoCalcShadowZBounds?: boolean }).autoCalcShadowZBounds = true;
    return gen;
  }

  /** Apply the current ShadowParams to a generator. Contact-hardening needs a
   *  directional/spot light; point lights fall back to PCF. */
  private configure(gen: ShadowGenerator, light: Light) {
    const p = this.params;
    gen.usePercentageCloserFiltering = false;
    gen.useContactHardeningShadow = false;
    gen.usePoissonSampling = false;
    gen.useBlurExponentialShadowMap = false;
    gen.useExponentialShadowMap = false;

    const cn = light.getClassName();
    const contactCapable = cn === 'DirectionalLight' || cn === 'SpotLight';
    if (p.filter === 'pcss' && contactCapable) {
      gen.useContactHardeningShadow = true;
      gen.contactHardeningLightSizeUVRatio = p.lightSizeUVRatio;
      gen.filteringQuality = QUALITY_MAP[p.quality];
    } else if (p.filter === 'pcf' || p.filter === 'pcss') {
      gen.usePercentageCloserFiltering = true;
      gen.filteringQuality = QUALITY_MAP[p.quality];
    }
    // 'none' (hard) leaves all filters off for crisp aliased edges.
    gen.bias = p.bias;
    gen.normalBias = p.normalBias;
    gen.setDarkness(p.darkness);
  }

  private disposeAll() {
    for (const gen of this.gens.values()) gen.dispose();
    this.gens.clear();
  }

  dispose() {
    this.disposeAll();
  }
}

/** A scene background suited to a lit 3D world (kept dark; the skybox/IBL drive the look). */
export const HQ_CLEAR_COLOR = new Color4(0.05, 0.06, 0.09, 1);
