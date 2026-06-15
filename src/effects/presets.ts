import { nanoid } from 'nanoid';
import type { EffectConfig, EffectInstance } from '@/types';

/**
 * Built-in, plug-and-play VFX presets. Each returns a full EffectConfig that maps
 * onto a Babylon particle system. They are the reuse mechanism: drop one on any
 * entity, then tune. 2D presets emit in the XY plane (gravity in ±Y, billboarded).
 */

export type EffectCategory = '2d' | '3d' | 'both';

function base(): EffectConfig {
  return {
    emitter: {
      shape: 'sphere',
      radius: 0.3,
      angle: 0.5,
      boxMin: { x: -0.3, y: 0, z: -0.3 },
      boxMax: { x: 0.3, y: 0, z: 0.3 },
      direction1: { x: -0.4, y: 1, z: -0.4 },
      direction2: { x: 0.4, y: 1, z: 0.4 },
    },
    capacity: 2000,
    emitRate: 100,
    minSize: 0.2,
    maxSize: 0.5,
    minLifeTime: 0.5,
    maxLifeTime: 1.5,
    minEmitPower: 1,
    maxEmitPower: 3,
    gravity: { x: 0, y: 0, z: 0 },
    color1: [1, 1, 1, 1],
    color2: [1, 1, 1, 1],
    colorDead: [0, 0, 0, 0],
    blendMode: 'ADD',
    billboard: true,
    texture: 'soft',
    useGPU: true,
    playback: { mode: 'auto', loop: true, duration: 2, delay: 0 },
  };
}

/** A preset override: top-level fields are full values; emitter/playback may be partial. */
type PresetPatch = Partial<Omit<EffectConfig, 'emitter' | 'playback'>> & {
  emitter?: Partial<EffectConfig['emitter']>;
  playback?: Partial<EffectConfig['playback']>;
};

/** Merge a patch onto the base config (handles the nested emitter/playback). */
function def(p: PresetPatch): EffectConfig {
  const b = base();
  return {
    ...b,
    ...p,
    emitter: { ...b.emitter, ...(p.emitter ?? {}) },
    playback: { ...b.playback, ...(p.playback ?? {}) },
  };
}

export interface EffectPreset {
  label: string;
  category: EffectCategory;
  config: EffectConfig;
}

export const EFFECT_PRESETS: Record<string, EffectPreset> = {
  fire: {
    label: 'Fire',
    category: 'both',
    config: def({
      emitter: { shape: 'cone', radius: 0.3, angle: 0.4 },
      emitRate: 220,
      minSize: 0.3,
      maxSize: 0.8,
      minLifeTime: 0.4,
      maxLifeTime: 1,
      minEmitPower: 1,
      maxEmitPower: 2.5,
      gravity: { x: 0, y: 1.2, z: 0 },
      color1: [1, 0.7, 0.1, 1],
      color2: [1, 0.3, 0, 1],
      colorDead: [0.2, 0, 0, 0],
      blendMode: 'ADD',
      texture: 'soft',
      colorGradients: [
        { at: 0, color: [1, 1, 0.6, 1] },
        { at: 0.45, color: [1, 0.5, 0, 1] },
        { at: 1, color: [0.4, 0, 0, 0] },
      ],
      sizeGradients: [
        { at: 0, value: 0.4 },
        { at: 1, value: 0.05 },
      ],
    }),
  },
  smoke: {
    label: 'Smoke',
    category: 'both',
    config: def({
      emitter: { shape: 'cone', radius: 0.4, angle: 0.5 },
      emitRate: 40,
      minSize: 0.8,
      maxSize: 2,
      minLifeTime: 1.5,
      maxLifeTime: 3,
      minEmitPower: 0.6,
      maxEmitPower: 1.4,
      gravity: { x: 0.2, y: 1, z: 0 },
      color1: [0.4, 0.4, 0.45, 0.5],
      color2: [0.2, 0.2, 0.25, 0.4],
      colorDead: [0.1, 0.1, 0.1, 0],
      blendMode: 'STANDARD',
      texture: 'smoke',
      sizeGradients: [
        { at: 0, value: 0.6 },
        { at: 1, value: 2 },
      ],
    }),
  },
  explosion: {
    label: 'Explosion',
    category: 'both',
    config: def({
      emitter: { shape: 'sphere', radius: 0.2 },
      capacity: 3000,
      emitRate: 4000,
      minSize: 0.3,
      maxSize: 0.9,
      minLifeTime: 0.3,
      maxLifeTime: 0.8,
      minEmitPower: 6,
      maxEmitPower: 12,
      gravity: { x: 0, y: -3, z: 0 },
      color1: [1, 0.8, 0.2, 1],
      color2: [1, 0.3, 0, 1],
      colorDead: [0.1, 0, 0, 0],
      blendMode: 'ADD',
      texture: 'soft',
      playback: { mode: 'manual', loop: false, duration: 0.12, delay: 0 },
    }),
  },
  sparkle: {
    label: 'Sparkle / Magic',
    category: 'both',
    config: def({
      emitter: { shape: 'sphere', radius: 0.6 },
      emitRate: 60,
      minSize: 0.15,
      maxSize: 0.4,
      minLifeTime: 0.6,
      maxLifeTime: 1.6,
      minEmitPower: 0.2,
      maxEmitPower: 1,
      gravity: { x: 0, y: 0.3, z: 0 },
      color1: [0.6, 0.9, 1, 1],
      color2: [0.8, 0.6, 1, 1],
      colorDead: [0.2, 0.3, 0.6, 0],
      blendMode: 'ADD',
      texture: 'star',
    }),
  },
  confetti: {
    label: 'Confetti',
    category: 'both',
    config: def({
      emitter: { shape: 'cone', radius: 0.2, angle: 0.7 },
      capacity: 1500,
      emitRate: 600,
      minSize: 0.12,
      maxSize: 0.28,
      minLifeTime: 1.5,
      maxLifeTime: 3,
      minEmitPower: 5,
      maxEmitPower: 9,
      gravity: { x: 0, y: -6, z: 0 },
      color1: [1, 0.2, 0.5, 1],
      color2: [0.2, 0.8, 1, 1],
      colorDead: [1, 0.9, 0.2, 1],
      blendMode: 'STANDARD',
      texture: 'circle',
      billboard: true,
      playback: { mode: 'manual', loop: false, duration: 0.4, delay: 0 },
    }),
  },
  muzzleFlash: {
    label: 'Muzzle Flash',
    category: '3d',
    config: def({
      emitter: { shape: 'cone', radius: 0.1, angle: 0.3 },
      capacity: 400,
      emitRate: 2000,
      minSize: 0.2,
      maxSize: 0.6,
      minLifeTime: 0.05,
      maxLifeTime: 0.15,
      minEmitPower: 4,
      maxEmitPower: 8,
      color1: [1, 0.9, 0.6, 1],
      color2: [1, 0.6, 0.1, 1],
      colorDead: [0.3, 0.1, 0, 0],
      blendMode: 'ADD',
      texture: 'soft',
      playback: { mode: 'manual', loop: false, duration: 0.05, delay: 0 },
    }),
  },
  heal: {
    label: 'Heal / Aura',
    category: 'both',
    config: def({
      emitter: { shape: 'cone', radius: 0.6, angle: 0.15 },
      emitRate: 80,
      minSize: 0.2,
      maxSize: 0.45,
      minLifeTime: 0.8,
      maxLifeTime: 1.6,
      minEmitPower: 1.5,
      maxEmitPower: 3,
      gravity: { x: 0, y: 2, z: 0 },
      color1: [0.4, 1, 0.6, 1],
      color2: [0.7, 1, 0.8, 1],
      colorDead: [0.2, 0.6, 0.3, 0],
      blendMode: 'ADD',
      texture: 'star',
    }),
  },
  rain: {
    label: 'Rain',
    category: 'both',
    config: def({
      emitter: {
        shape: 'box',
        boxMin: { x: -6, y: 6, z: -6 },
        boxMax: { x: 6, y: 6, z: 6 },
        direction1: { x: 0, y: -1, z: 0 },
        direction2: { x: 0, y: -1, z: 0 },
      },
      capacity: 4000,
      emitRate: 800,
      minSize: 0.05,
      maxSize: 0.12,
      minLifeTime: 0.8,
      maxLifeTime: 1.2,
      minEmitPower: 12,
      maxEmitPower: 18,
      gravity: { x: 0, y: -20, z: 0 },
      color1: [0.6, 0.7, 1, 0.5],
      color2: [0.7, 0.8, 1, 0.4],
      colorDead: [0.6, 0.7, 1, 0],
      blendMode: 'STANDARD',
      texture: 'spark',
      billboard: false,
    }),
  },
  snow: {
    label: 'Snow',
    category: 'both',
    config: def({
      emitter: {
        shape: 'box',
        boxMin: { x: -6, y: 6, z: -6 },
        boxMax: { x: 6, y: 6, z: 6 },
        direction1: { x: -0.3, y: -1, z: -0.3 },
        direction2: { x: 0.3, y: -1, z: 0.3 },
      },
      capacity: 3000,
      emitRate: 200,
      minSize: 0.1,
      maxSize: 0.25,
      minLifeTime: 3,
      maxLifeTime: 6,
      minEmitPower: 1,
      maxEmitPower: 2,
      gravity: { x: 0, y: -1.2, z: 0 },
      color1: [1, 1, 1, 0.9],
      color2: [0.85, 0.9, 1, 0.8],
      colorDead: [1, 1, 1, 0],
      blendMode: 'STANDARD',
      texture: 'circle',
    }),
  },
  dust: {
    label: 'Dust Trail',
    category: 'both',
    config: def({
      emitter: { shape: 'sphere', radius: 0.2 },
      emitRate: 30,
      minSize: 0.2,
      maxSize: 0.6,
      minLifeTime: 0.4,
      maxLifeTime: 1,
      minEmitPower: 0.2,
      maxEmitPower: 0.8,
      gravity: { x: 0, y: 0.4, z: 0 },
      color1: [0.7, 0.65, 0.55, 0.5],
      color2: [0.5, 0.45, 0.4, 0.35],
      colorDead: [0.4, 0.38, 0.35, 0],
      blendMode: 'STANDARD',
      texture: 'smoke',
    }),
  },
  electric: {
    label: 'Electricity',
    category: 'both',
    config: def({
      emitter: { shape: 'sphere', radius: 0.5 },
      emitRate: 120,
      minSize: 0.1,
      maxSize: 0.35,
      minLifeTime: 0.1,
      maxLifeTime: 0.35,
      minEmitPower: 2,
      maxEmitPower: 6,
      color1: [0.6, 0.85, 1, 1],
      color2: [0.8, 0.95, 1, 1],
      colorDead: [0.3, 0.5, 1, 0],
      blendMode: 'ADD',
      texture: 'spark',
    }),
  },
};

/** Preset ids available for a given game mode (2d shows 'both' + '2d', 3d shows 'both' + '3d'). */
export function presetsForMode(mode: '2d' | '3d'): string[] {
  return Object.keys(EFFECT_PRESETS).filter((id) => {
    const cat = EFFECT_PRESETS[id].category;
    return cat === 'both' || cat === mode;
  });
}

/** Build a fresh EffectInstance from a preset (deep-cloned so edits are independent). */
export function makeEffectInstance(presetId: string): EffectInstance {
  const preset = EFFECT_PRESETS[presetId] ?? EFFECT_PRESETS.fire;
  return {
    id: nanoid(8),
    name: preset.label,
    enabled: true,
    preset: presetId,
    config: structuredClone(preset.config),
  };
}
