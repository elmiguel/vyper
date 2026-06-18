import type { Scene } from '@babylonjs/core/scene';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { CubeTexture } from '@babylonjs/core/Materials/Textures/cubeTexture';
import { HDRCubeTexture } from '@babylonjs/core/Materials/Textures/hdrCubeTexture';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration';
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture';
import type { Material } from '@babylonjs/core/Materials/material';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { StudioTone, StudioEnv } from './modelerEnvironment';
import type { MaterialConfig } from '@/types';

/**
 * Whether the model should render with its PBR material. True whenever a material is assigned
 * (so textures/maps preview without any toggle), or when `litPreview` forces lit shading on a
 * material-less mesh (to see environment lighting on a plain colour).
 */
export function usesLitMaterial(litPreview: boolean, material?: MaterialConfig): boolean {
  return litPreview || !!material;
}

/** Set/reuse/clear one PBR texture slot by URL (disposes the previous one when it changes). */
function setMap(
  mat: PBRMaterial,
  key: 'albedoTexture' | 'bumpTexture' | 'emissiveTexture' | 'ambientTexture' | 'metallicTexture',
  url: string | undefined,
  scene: Scene,
): void {
  const cur = mat[key] as Texture | null;
  if (!url) {
    if (cur) { cur.dispose(); mat[key] = null; }
    return;
  }
  if (cur && cur.name === url) return;
  cur?.dispose();
  mat[key] = new Texture(url, scene);
}

/**
 * Owns the Modeling Studio's viewport *preview* state — image-based environment lighting, an
 * optional background skybox, tone mapping, and a lit PBR material — factored out of
 * {@link ModelerScene} to keep it within the size budget. Mirrors the game's render path
 * (RenderPipeline / materials.ts `applyPbr`) so the preview matches what ships, but it only
 * ever touches the modeler's own scene. The flat StandardMaterial stays the default; lit
 * preview is an opt-in that reflects the environment.
 */
export class StudioPreview {
  private env?: BaseTexture;
  private skybox?: Mesh;
  private pbrMat?: PBRMaterial;
  private lit = false;
  private readonly hemi: HemisphericLight;
  private readonly key: DirectionalLight;

  constructor(private readonly scene: Scene) {
    // Soft fill + a key directional light for readable shading (intensities tunable below).
    this.hemi = new HemisphericLight('hemi', new Vector3(0.3, 1, 0.4), scene);
    this.hemi.intensity = 0.75;
    this.key = new DirectionalLight('key', new Vector3(-0.5, -1, -0.4), scene);
    this.key.intensity = 1.1;
  }

  /** Key (directional) + fill (hemispheric) light intensities. */
  lights(key: number, fill: number): void {
    this.key.intensity = Math.max(0, key);
    this.hemi.intensity = Math.max(0, fill);
  }

  /** Tone-mapping curve + exposure for the viewport. */
  toneMapping(tone: StudioTone, exposure: number): void {
    const ip = this.scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = tone !== 'none';
    ip.toneMappingType = tone === 'aces'
      ? ImageProcessingConfiguration.TONEMAPPING_ACES
      : ImageProcessingConfiguration.TONEMAPPING_STANDARD;
    ip.exposure = exposure;
  }

  /** Image-based environment: `.hdr` (equirect → cube) or prefiltered `.env`/`.dds`; empty
   *  clears it. `intensity` scales the IBL; `skybox` toggles the env-as-background. */
  environment(url: string, intensity: number, skybox: boolean): void {
    this.scene.environmentIntensity = Math.max(0, intensity);
    if (!url) {
      this.env?.dispose();
      this.env = undefined;
      this.scene.environmentTexture = null;
    } else if (this.env?.name !== url) {
      this.env?.dispose();
      this.env = /\.hdr($|\?)/i.test(url) ? new HDRCubeTexture(url, this.scene, 256) : CubeTexture.CreateFromPrefilteredData(url, this.scene);
      this.scene.environmentTexture = this.env;
    }
    this.skybox?.dispose();
    this.skybox = undefined;
    if (url && skybox && this.env) this.skybox = this.scene.createDefaultSkybox(this.env, true, 1000, 0.3) ?? undefined;
  }

  /** Turn the lit PBR preview on/off and (re)build its material from the mesh's colour + config. */
  setLit(on: boolean, color: string, material?: MaterialConfig): void {
    this.lit = on;
    if (on) {
      if (!this.pbrMat) {
        this.pbrMat = new PBRMaterial('modelPbr', this.scene);
        this.pbrMat.backFaceCulling = false;
        this.pbrMat.zOffset = 2;
      }
      this.applyPbr(color, material);
    }
  }

  /** Refresh the lit material from a colour + config while it's active (after a material edit). */
  refresh(color: string, material?: MaterialConfig): void {
    if (this.lit && this.pbrMat) this.applyPbr(color, material);
  }

  /** Update only the base colour of the lit material (when it has no albedo texture). */
  setColor(color: string): void {
    if (this.pbrMat && !this.pbrMat.albedoTexture) this.pbrMat.albedoColor = Color3.FromHexString(color);
  }

  /** Apply every preview setting at once from the store's {@link StudioEnv} + the mesh's base
   *  colour and optional material config (tone → environment → lights → lit material). The mesh
   *  renders with its real PBR material whenever one is assigned (so textures/maps show without
   *  a separate toggle); the `litPreview` flag additionally forces PBR for material-less meshes
   *  (e.g. to see environment lighting on a plain colour). */
  apply(env: StudioEnv, color: string, material?: MaterialConfig): void {
    this.toneMapping(env.tone, env.exposure);
    this.environment(env.url, env.intensity, env.skybox);
    this.lights(env.key, env.fill);
    this.setLit(usesLitMaterial(env.litPreview, material), color, material);
  }

  /** Which material the model mesh should use right now: the lit PBR one, or `fallback`. */
  activeMaterial(fallback: Material): Material {
    return this.lit && this.pbrMat ? this.pbrMat : fallback;
  }

  dispose(): void {
    this.env?.dispose();
    this.skybox?.dispose();
    this.pbrMat?.dispose();
  }

  /** Mirror of the game's `applyPbr`: albedo/metallic/roughness/alpha/emissive + texture maps. */
  private applyPbr(color: string, m?: MaterialConfig): void {
    const mat = this.pbrMat;
    if (!mat) return;
    mat.albedoColor = m?.baseColorMap ? Color3.White() : Color3.FromHexString(color);
    mat.metallic = m?.metallic ?? 0;
    mat.roughness = m?.roughness ?? 1;
    mat.alpha = m?.alpha ?? 1;
    mat.emissiveColor = m?.emissive ? Color3.FromHexString(m.emissive).scale(m.emissiveIntensity ?? 1) : Color3.Black();
    setMap(mat, 'albedoTexture', m?.baseColorMap, this.scene);
    setMap(mat, 'bumpTexture', m?.normalMap, this.scene);
    setMap(mat, 'emissiveTexture', m?.emissiveMap, this.scene);
    setMap(mat, 'ambientTexture', m?.aoMap, this.scene);
    setMap(mat, 'metallicTexture', m?.roughnessMap, this.scene);
    mat.useRoughnessFromMetallicTextureGreen = !!m?.roughnessMap;
    mat.useMetallnessFromMetallicTextureBlue = false;
    mat.useRoughnessFromMetallicTextureAlpha = false;
  }
}
