import type { Scene } from '@babylonjs/core/scene';
import type { Camera } from '@babylonjs/core/Cameras/camera';
import type { Light } from '@babylonjs/core/Lights/light';
import type { IShadowLight } from '@babylonjs/core/Lights/shadowLight';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
import { SSAO2RenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { CubeTexture } from '@babylonjs/core/Materials/Textures/cubeTexture';
import { HDRCubeTexture } from '@babylonjs/core/Materials/Textures/hdrCubeTexture';
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture';
// Side effects required by the tree-shaken core build.
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import '@babylonjs/core/Rendering/prePassRendererSceneComponent';
import '@babylonjs/core/Rendering/geometryBufferRendererSceneComponent';

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
  private environment?: BaseTexture;
  private skybox?: AbstractMesh;
  private lastEnvUrl = '';

  constructor(
    private readonly scene: Scene,
    private readonly cameras: Camera[],
  ) {}

  /** Reconcile every effect with the current settings. Cheap to call repeatedly. */
  apply(s: RenderSettings) {
    if (!s.enabled) {
      this.teardownPostProcessing();
      this.shadows.setConfig(s, false);
      void this.applyEnvironment('', s);
      return;
    }
    this.applyDefaultPipeline(s);
    this.applySsao(s);
    this.shadows.setConfig(s);
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
      const ip = p.imageProcessing;
      ip.toneMappingEnabled = muted ? false : s.tone !== 'none';
      ip.vignetteEnabled = muted ? false : s.vignette;
      ip.exposure = muted ? 1 : s.exposure;
      ip.contrast = muted ? 1 : s.contrast;
    }
    if (this.ssao) this.ssao.totalStrength = muted ? 0 : s.ssaoIntensity;
  }

  private applyDefaultPipeline(s: RenderSettings) {
    if (!this.pipeline) {
      this.pipeline = new DefaultRenderingPipeline('hq', true, this.scene, this.cameras);
    }
    const p = this.pipeline;
    p.imageProcessingEnabled = true;
    const ip = p.imageProcessing;
    ip.toneMappingEnabled = s.tone !== 'none';
    ip.toneMappingType = TONE_MAP[s.tone];
    ip.exposure = s.exposure;
    ip.contrast = s.contrast;
    ip.vignetteEnabled = s.vignette;
    p.bloomEnabled = s.bloom;
    p.bloomWeight = s.bloomIntensity;
    p.fxaaEnabled = s.fxaa;
    p.grainEnabled = s.grain;
    // 4× MSAA for clean geometry edges, always — FXAA alone leaves crawling edges
    // that read as "gritty" on a sharp PBR scene.
    p.samples = 4;
  }

  private applySsao(s: RenderSettings) {
    const supported = SSAO2RenderingPipeline.IsSupported;
    if (!s.ssao || !supported) {
      this.ssao?.dispose();
      this.ssao = undefined;
      return;
    }
    if (!this.ssao) {
      // Half-resolution AO with a cheap bilateral blur — full-res 16-sample AO with
      // expensiveBlur was a large fill-rate cost for a barely-visible quality gain.
      this.ssao = new SSAO2RenderingPipeline('hq-ssao', this.scene, { ssaoRatio: 0.5, blurRatio: 0.5 }, this.cameras);
      this.ssao.samples = 8;
      this.ssao.expensiveBlur = false;
    }
    this.ssao.totalStrength = s.ssaoIntensity;
    this.ssao.radius = 2;
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

  dispose() {
    this.teardownPostProcessing();
    this.shadows.dispose();
    this.environment?.dispose();
    this.skybox?.dispose();
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
