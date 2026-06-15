import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import { GPUParticleSystem } from '@babylonjs/core/Particles/gpuParticleSystem';
import type { IParticleSystem } from '@babylonjs/core/Particles/IParticleSystem';
import type { Scene } from '@babylonjs/core/scene';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import type { BlendMode, EffectConfig, RGBA, Vec3 } from '@/types';
import { getParticleTexture } from '@/effects/particleTextures';

const v3 = (v: Vec3) => new Vector3(v.x, v.y, v.z);
const c4 = (c: RGBA) => new Color4(c[0], c[1], c[2], c[3]);

function blend(mode: BlendMode): number {
  switch (mode) {
    case 'ADD':
      return ParticleSystem.BLENDMODE_ADD;
    case 'ONEONE':
      return ParticleSystem.BLENDMODE_ONEONE;
    case 'MULTIPLY':
      return ParticleSystem.BLENDMODE_MULTIPLY;
    default:
      return ParticleSystem.BLENDMODE_STANDARD;
  }
}

/** True when GPU particles can run (WebGL2/WebGPU). */
export function gpuParticlesSupported(): boolean {
  return GPUParticleSystem.IsSupported;
}

/**
 * Build a live Babylon particle system from an EffectConfig. Used by both the
 * in-game runtime and the isolated editor preview, so previews are faithful.
 * The caller owns start()/stop()/dispose() and lifetime tracking.
 */
export function buildParticleSystem(
  scene: Scene,
  config: EffectConfig,
  emitter: AbstractMesh | Vec3,
  name = 'fx',
): IParticleSystem {
  const capacity = Math.max(1, Math.floor(config.capacity));
  const useGpu = config.useGPU && GPUParticleSystem.IsSupported;
  const ps: IParticleSystem = useGpu
    ? new GPUParticleSystem(name, { capacity }, scene)
    : new ParticleSystem(name, capacity, scene);

  ps.emitter = emitter instanceof Object && 'position' in emitter ? (emitter as AbstractMesh) : v3(emitter as Vec3);
  ps.particleTexture = getParticleTexture(scene, config.texture);
  ps.blendMode = blend(config.blendMode);
  ps.isBillboardBased = config.billboard;

  ps.emitRate = config.emitRate;
  ps.minSize = config.minSize;
  ps.maxSize = config.maxSize;
  ps.minLifeTime = config.minLifeTime;
  ps.maxLifeTime = config.maxLifeTime;
  ps.minEmitPower = config.minEmitPower;
  ps.maxEmitPower = config.maxEmitPower;
  ps.gravity = v3(config.gravity);

  ps.color1 = c4(config.color1);
  ps.color2 = c4(config.color2);
  ps.colorDead = c4(config.colorDead);

  // Emitter shape.
  const e = config.emitter;
  switch (e.shape) {
    case 'box':
      ps.createBoxEmitter(v3(e.direction1), v3(e.direction2), v3(e.boxMin), v3(e.boxMax));
      break;
    case 'sphere':
      ps.createSphereEmitter(e.radius, 1);
      break;
    case 'cone':
      ps.createConeEmitter(e.radius, e.angle);
      break;
    default:
      ps.createPointEmitter(v3(e.direction1), v3(e.direction2));
      break;
  }

  // Gradients override the flat colors / sizes when provided.
  if (config.colorGradients?.length) {
    for (const g of config.colorGradients) ps.addColorGradient(g.at, c4(g.color));
  }
  if (config.sizeGradients?.length) {
    for (const g of config.sizeGradients) ps.addSizeGradient(g.at, g.value);
  }

  // Timing / playback.
  const { loop, duration, delay } = config.playback;
  ps.targetStopDuration = loop ? 0 : Math.max(0.001, duration);
  ps.startDelay = Math.max(0, delay) * 1000;
  // One-shots clean themselves up; looped systems are disposed by the owner.
  ps.disposeOnStop = !loop;

  return ps;
}
