import type { IParticleSystem } from '@babylonjs/core/Particles/IParticleSystem';
import type { Scene } from '@babylonjs/core/scene';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { EffectConfig } from '@/types';
import { buildParticleSystem } from './effects';

/** Accessors EffectsManager needs from its owning SceneManager. */
export interface EffectsContext {
  scene: Scene;
  getMesh(id: string): AbstractMesh | undefined;
}

/** Owns the live particle systems (VFX) emitting from entities. */
export class EffectsManager {
  /** Live particle systems, keyed by entityId, so they can be stopped/cleared. */
  private effectSystems = new Map<string, IParticleSystem[]>();

  constructor(private ctx: EffectsContext) {}

  /**
   * Build + start a particle effect emitting from an entity's mesh (or world
   * origin if it has none). Used for auto-play, script `entity.playEffect()`,
   * and fx nodes. One-shot/timed vs looped behaviour comes from the config.
   */
  playEffect(entityId: string, config: EffectConfig): void {
    const mesh = this.ctx.getMesh(entityId);
    const emitter = mesh ?? { x: 0, y: 0, z: 0 };
    const ps = buildParticleSystem(this.ctx.scene, config, emitter, `fx_${entityId}`);
    const list = this.effectSystems.get(entityId) ?? [];
    list.push(ps);
    this.effectSystems.set(entityId, list);
    // Drop one-shot systems from tracking once they self-dispose.
    ps.onDisposeObservable.add(() => {
      const arr = this.effectSystems.get(entityId);
      if (!arr) return;
      const i = arr.indexOf(ps);
      if (i >= 0) arr.splice(i, 1);
    });
    ps.start();
  }

  /** Stop (and dispose) all effects on an entity. */
  stopEffect(entityId: string): void {
    const list = this.effectSystems.get(entityId);
    if (!list) return;
    for (const ps of list.slice()) {
      ps.stop();
      ps.dispose();
    }
    this.effectSystems.delete(entityId);
  }

  /** Dispose every running effect (called on Stop / teardown). */
  clearEffects(): void {
    for (const list of this.effectSystems.values()) {
      for (const ps of list.slice()) ps.dispose();
    }
    this.effectSystems.clear();
  }
}
