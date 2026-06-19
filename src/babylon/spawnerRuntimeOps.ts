import type { Vector3 } from '@babylonjs/core/Maths/math';
import type { Scene } from '@babylonjs/core/scene';
import type { Tracked } from './sceneSync';

/** What the spawn-instance ops need from the SceneManager. */
export interface SpawnRuntimeCtx {
  tracked: Map<string, Tracked>;
  scene: Scene;
}

/**
 * Clone a target object's source mesh into a runtime spawn instance, tracked under `instanceId`.
 * The clone keeps the source's geometry/material/layer (so it's game-visible) and is created
 * disabled — the {@link SpawnPool} enables + places it on spawn. Returns false if the source mesh
 * isn't present (nothing to clone). Instances are never added to the store, so Stop disposes them.
 */
export function createSpawnInstance(ctx: SpawnRuntimeCtx, targetId: string, instanceId: string): boolean {
  const src = ctx.tracked.get(targetId)?.mesh;
  if (!src) return false;
  const clone = src.clone(instanceId, null);
  if (!clone) return false;
  clone.metadata = { ...(src.metadata as object | null), entityId: instanceId };
  clone.setEnabled(false);
  clone.isVisible = true;
  ctx.tracked.set(instanceId, { mesh: clone });
  return true;
}

/** Move a tracked spawn instance to a world position (the spawner's location). */
export function placeSpawnInstance(ctx: SpawnRuntimeCtx, instanceId: string, worldPos: Vector3): void {
  ctx.tracked.get(instanceId)?.mesh?.setAbsolutePosition(worldPos);
}
