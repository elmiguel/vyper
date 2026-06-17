import { Vector3, Quaternion } from '@babylonjs/core/Maths/math';
import type { PhysicsManager } from './PhysicsManager';
import type { EffectsManager } from './EffectsManager';
import type { Tracked } from './sceneSync';
import { slideVelocity } from '../runtime/volumeGeometry';

/** What the runtime entity-control ops need from the SceneManager. */
export interface RuntimeOpsCtx {
  tracked: Map<string, Tracked>;
  physics: PhysicsManager;
  effects: EffectsManager;
}

// Runtime entity control used by cross-entity script/trigger actions + volumes.
// Free functions (operating on a small context) to keep SceneManager lean.

/** Show/hide a surface at runtime (rendering only — stays collidable). */
export function setEntityVisible(ctx: RuntimeOpsCtx, id: string, visible: boolean): void {
  const m = ctx.tracked.get(id)?.mesh;
  if (m) m.isVisible = visible;
}

/** Activate/deactivate: remove the mesh from the world entirely + drop its body. */
export function setEntityActive(ctx: RuntimeOpsCtx, id: string, active: boolean): void {
  const t = ctx.tracked.get(id);
  t?.mesh?.setEnabled(active);
  if (!active) ctx.physics.disposeBody(id);
}

/** Move an entity to a world position at runtime (dead-zone respawn / teleport).
 *  Moves the physics body too (bodies don't follow mesh moves — disablePreStep) and
 *  zeroes its velocity so it doesn't carry momentum. */
export function repositionEntity(ctx: RuntimeOpsCtx, id: string, worldPos: Vector3): void {
  const mesh = ctx.tracked.get(id)?.mesh;
  if (!mesh) return;
  mesh.setAbsolutePosition(worldPos);
  const body = ctx.physics.getBody(id);
  if (body) {
    const rot = mesh.rotationQuaternion ?? Quaternion.FromEulerVector(mesh.rotation);
    body.setTargetTransform(worldPos, rot);
    body.setLinearVelocity(Vector3.Zero());
    body.setAngularVelocity(Vector3.Zero());
  }
}

/** Constrain an entity to a boundary surface: place it at the clamped point and
 *  remove ONLY the velocity component pushing through the boundary (along
 *  `worldNormal`, pointing to the allowed side). Tangential/outward motion is kept,
 *  so the object slides along the boundary like a wall instead of being pinned. */
export function constrainEntity(ctx: RuntimeOpsCtx, id: string, worldPos: Vector3, worldNormal: Vector3): void {
  const mesh = ctx.tracked.get(id)?.mesh;
  if (!mesh) return;
  mesh.setAbsolutePosition(worldPos);
  const body = ctx.physics.getBody(id);
  if (!body) return;
  const rot = mesh.rotationQuaternion ?? Quaternion.FromEulerVector(mesh.rotation);
  body.setTargetTransform(worldPos, rot);
  const v = body.getLinearVelocity();
  const s = slideVelocity({ x: v.x, y: v.y, z: v.z }, { x: worldNormal.x, y: worldNormal.y, z: worldNormal.z });
  body.setLinearVelocity(new Vector3(s.x, s.y, s.z));
}

/** Destroy an entity's runtime presence (mesh, body, effects). Rebuilt by sync on Stop. */
export function destroyRuntimeEntity(ctx: RuntimeOpsCtx, id: string): void {
  ctx.effects.stopEffect(id);
  ctx.physics.disposeBody(id);
  const t = ctx.tracked.get(id);
  t?.mesh?.dispose();
  t?.light?.dispose();
  ctx.tracked.delete(id);
}
