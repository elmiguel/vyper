/** Tone-mapping curve for the Studio viewport preview (mirrors the game's RenderSettings.tone). */
export type StudioTone = 'none' | 'standard' | 'aces';

/**
 * Studio-only viewport preview settings: image-based environment lighting, key/fill levels,
 * and tone mapping. These affect ONLY the Modeling Studio's own Babylon viewport
 * ({@link ModelerScene}) — they are not the game's RenderSettings and never touch the scene/
 * game pipeline. The Studio is a material/model workbench, so this lets you light and grade
 * the preview without changing the shipped game.
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
  /**
   * Render the model with a PBR material that reflects the environment and reads the mesh
   * entity's MaterialConfig (metallic/roughness/emissive/maps). Off (default) keeps the flat
   * StandardMaterial the modeler has always used — so this is a no-regression opt-in.
   */
  litPreview: boolean;
}

export function defaultStudioEnv(): StudioEnv {
  return { url: '', intensity: 1, skybox: false, tone: 'aces', exposure: 1, key: 1.1, fill: 0.75, litPreview: false };
}
