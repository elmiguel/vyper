import type { Scene } from '@babylonjs/core/scene';
import type { Material } from '@babylonjs/core/Materials/material';
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer';
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { FoliageConfig } from '@/types';
import { defaultFoliage } from '@/types';

/**
 * Stylized "neon grass" material: a **PBR** surface (so it shares the scene's
 * lights + IBL exactly like every other 3D mesh — a StandardMaterial here would
 * ignore the environment and read flat/dark next to PBR neighbours) augmented by
 * {@link FoliagePlugin}, which injects
 *  - a vertex wind sway (blade tip moves more than the base), and
 *  - a fragment fresnel **rim glow** that brightens the silhouette.
 *
 * Both injections use only documented injection points (CUSTOM_VERTEX_UPDATE_POSITION,
 * CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR) and variables that exist in the PBR shaders
 * (`positionUpdated`, `normalW`, `vPositionW`, `finalColor`) plus the plugin's own
 * uniforms, so it stays self-contained.
 */
class FoliagePlugin extends MaterialPluginBase {
  time = 0;
  strength = defaultFoliage().windStrength;
  speed = defaultFoliage().windSpeed;
  rim = new Color3(0.49, 1, 0.54);
  rimIntensity = defaultFoliage().rimIntensity;
  private readonly camPos = new Vector3();

  constructor(material: Material) {
    // Priority 200: after the core vertex code that fills `positionUpdated`.
    super(material, 'Foliage', 200, { FOLIAGE: false });
    this._enable(true);
  }

  override prepareDefines(defines: Record<string, unknown>) {
    defines.FOLIAGE = true;
  }

  override getClassName() {
    return 'FoliagePlugin';
  }

  override getUniforms() {
    return {
      ubo: [
        { name: 'foliageWindTime', size: 1, type: 'float' },
        { name: 'foliageWindStrength', size: 1, type: 'float' },
        { name: 'foliageWindSpeed', size: 1, type: 'float' },
        { name: 'foliageRimColor', size: 3, type: 'vec3' },
        { name: 'foliageRimIntensity', size: 1, type: 'float' },
        { name: 'foliageCameraPos', size: 3, type: 'vec3' },
      ],
      vertex:
        'uniform float foliageWindTime;\nuniform float foliageWindStrength;\nuniform float foliageWindSpeed;\n',
      fragment:
        'uniform vec3 foliageRimColor;\nuniform float foliageRimIntensity;\nuniform vec3 foliageCameraPos;\n',
    };
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer, scene: Scene) {
    uniformBuffer.updateFloat('foliageWindTime', this.time);
    uniformBuffer.updateFloat('foliageWindStrength', this.strength);
    uniformBuffer.updateFloat('foliageWindSpeed', this.speed);
    uniformBuffer.updateColor3('foliageRimColor', this.rim);
    uniformBuffer.updateFloat('foliageRimIntensity', this.rimIntensity);
    const cam = scene.activeCamera;
    if (cam) this.camPos.copyFrom(cam.globalPosition);
    uniformBuffer.updateVector3('foliageCameraPos', this.camPos);
  }

  override getCustomCode(shaderType: string): Record<string, string> | null {
    if (shaderType === 'vertex') {
      // `positionUpdated` (object space) is available here; sway scales with height
      // so the base stays planted and the tip moves.
      return {
        CUSTOM_VERTEX_UPDATE_POSITION: `
          float foliageSway = sin(foliageWindTime * foliageWindSpeed + positionUpdated.x * 0.6 + positionUpdated.z * 0.6) * foliageWindStrength;
          float foliageHeight = max(positionUpdated.y, 0.0);
          positionUpdated.x += foliageSway * foliageHeight;
          positionUpdated.z += foliageSway * 0.5 * foliageHeight;
        `,
      };
    }
    if (shaderType === 'fragment') {
      // Add a view-dependent rim to the composed colour: bright at grazing angles.
      return {
        CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `
          vec3 foliageView = normalize(foliageCameraPos - vPositionW);
          float foliageRim = pow(1.0 - clamp(dot(normalize(normalW), foliageView), 0.0, 1.0), 2.0);
          finalColor.rgb += foliageRimColor * (foliageRim * foliageRimIntensity);
        `,
      };
    }
    return null;
  }
}

/** Per-scene wind clock: one before-render observer advances `time` for every
 *  foliage plugin in the scene, so multi-view rendering can't speed up the sway. */
const sceneClocks = new WeakMap<Scene, Set<FoliagePlugin>>();

function ensureWindClock(scene: Scene, plugin: FoliagePlugin) {
  let plugins = sceneClocks.get(scene);
  if (!plugins) {
    plugins = new Set();
    sceneClocks.set(scene, plugins);
    let time = 0;
    scene.onBeforeRenderObservable.add(() => {
      time += scene.getEngine().getDeltaTime() / 1000;
      for (const p of plugins!) p.time = time;
    });
  }
  plugins.add(plugin);
}

/** WeakMap so we can fetch a material's plugin to retune it on config edits. */
const matPlugins = new WeakMap<PBRMaterial, FoliagePlugin>();

/** Build a foliage PBR material with the wind + rim plugin wired up. */
export function buildFoliageMaterial(scene: Scene, name: string): PBRMaterial {
  const mat = new PBRMaterial(name, scene);
  mat.metallic = 0;
  mat.roughness = 0.9; // grass is near-matte
  const plugin = new FoliagePlugin(mat);
  matPlugins.set(mat, plugin);
  ensureWindClock(scene, plugin);
  return mat;
}

/**
 * Configure a foliage material from the entity's colour + foliage tuning: green
 * base tint, wind strength/speed, and the rim-glow colour/intensity.
 */
export function applyFoliageConfig(mat: PBRMaterial, baseColorHex: string, cfg?: FoliageConfig) {
  const f = { ...defaultFoliage(), ...(cfg ?? {}) };
  mat.albedoColor = Color3.FromHexString(baseColorHex);
  const plugin = matPlugins.get(mat);
  if (plugin) {
    plugin.strength = f.windStrength;
    plugin.speed = f.windSpeed;
    plugin.rim = Color3.FromHexString(f.rimColor);
    plugin.rimIntensity = f.rimIntensity;
  }
}
