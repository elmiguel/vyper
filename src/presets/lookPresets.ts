import type { RenderSettings } from '@/types';

/**
 * Built-in "look" presets — art-direction bundles applied to the scene-wide render
 * pipeline in one click (the Game Style browser). Each `config` is a partial
 * RenderSettings merged over `defaultRenderSettings()`, so a preset only needs to
 * state what it changes; everything else falls back to the sensible defaults.
 *
 * Values are tuned for a 3D outdoor/landscape scene. They intentionally fix the
 * common over-the-top mistakes (e.g. a near focus plane that blurs an entire
 * landscape, extreme chromatic aberration) while still reading strongly.
 */
export interface LookPreset {
  id: string;
  label: string;
  description: string;
  config: Partial<RenderSettings>;
}

export const LOOK_PRESETS: Record<string, LookPreset> = {
  natural: {
    id: 'natural',
    label: 'Natural',
    description: 'Clean, true-to-life grade. The engine default look — filmic tone mapping, soft bloom, no lens stylization.',
    config: { fov: 45 },
  },

  hyperrealDreamscape: {
    id: 'hyperrealDreamscape',
    label: 'Hyperreal Dreamscape',
    description: 'The surreal "AI reel" look: wide-angle, super-saturated, glowing sky, teal-and-orange grade, chromatic edges, cinematic blur and god rays.',
    config: {
      fov: 75,
      tone: 'aces',
      exposure: 1.15,
      contrast: 1.35,
      saturation: 55,
      warmth: 0.5,
      bloom: true,
      bloomIntensity: 0.65,
      chromaticAberration: true,
      chromaticAberrationAmount: 1.6,
      sharpen: true,
      sharpenAmount: 0.45,
      dof: true,
      dofFocusDistance: 12000,
      dofFStop: 2,
      dofFocalLength: 35,
      dofBlur: 'high',
      vignette: true,
      // SSAO intentionally left off — its screen-space sampling reads as fine
      // grain/speckle on large surfaces (e.g. terrain), which fights the clean,
      // glossy dreamscape look. Users can still enable it manually.
      godRays: true,
      godRaysIntensity: 0.85,
    },
  },

  cinematic: {
    id: 'cinematic',
    label: 'Cinematic',
    description: 'Filmic and restrained: gentle warm grade, soft bloom, shallow depth-of-field and a vignette. A slightly longer (less wide) lens.',
    config: {
      fov: 40,
      tone: 'aces',
      exposure: 1,
      contrast: 1.2,
      saturation: 12,
      warmth: 0.3,
      bloom: true,
      bloomIntensity: 0.35,
      dof: true,
      dofFocusDistance: 9000,
      dofFStop: 2.8,
      dofFocalLength: 50,
      dofBlur: 'medium',
      sharpen: true,
      sharpenAmount: 0.3,
      vignette: true,
    },
  },

  goldenHour: {
    id: 'goldenHour',
    label: 'Golden Hour',
    description: 'Warm low-sun glow: amber highlights, lifted bloom and strong god rays through the scene.',
    config: {
      fov: 50,
      tone: 'aces',
      exposure: 1.1,
      contrast: 1.15,
      saturation: 30,
      warmth: 0.7,
      bloom: true,
      bloomIntensity: 0.5,
      vignette: true,
      godRays: true,
      godRaysIntensity: 0.7,
      dof: true,
      dofFocusDistance: 14000,
      dofFStop: 4,
      dofFocalLength: 45,
      dofBlur: 'low',
    },
  },

  vibrantToon: {
    id: 'vibrantToon',
    label: 'Vibrant Toon',
    description: 'Punchy and crisp: heavy saturation, sharpened edges, no lens blur or fringing — a clean, illustrative look.',
    config: {
      fov: 50,
      tone: 'standard',
      contrast: 1.25,
      saturation: 80,
      warmth: 0.1,
      bloom: true,
      bloomIntensity: 0.4,
      sharpen: true,
      sharpenAmount: 0.6,
    },
  },

  noir: {
    id: 'noir',
    label: 'Noir',
    description: 'High-contrast black & white with grain and a heavy vignette. Cool, desaturated and moody.',
    config: {
      fov: 45,
      tone: 'standard',
      exposure: 0.95,
      contrast: 1.5,
      saturation: -95,
      warmth: -0.2,
      bloom: true,
      bloomIntensity: 0.2,
      vignette: true,
      grain: true,
      sharpen: true,
      sharpenAmount: 0.4,
    },
  },
};

/** Preset ids in display order. */
export function lookPresetIds(): string[] {
  return Object.keys(LOOK_PRESETS);
}
