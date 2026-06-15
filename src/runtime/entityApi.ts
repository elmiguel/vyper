import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { Entity } from '@/types';
import type { SceneManager } from '@/babylon/SceneManager';
import { V, vec } from './vector';

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/** Build the API object scripts receive for one entity. */
export function makeEntityApi(entity: Entity, mesh: AbstractMesh | undefined, sceneManager: SceneManager) {
  const position = {} as { x: number; y: number; z: number };
  const rotation = {} as { x: number; y: number; z: number };
  if (mesh) {
    Object.defineProperties(position, {
      x: { get: () => mesh.position.x, set: (v) => (mesh.position.x = v), enumerable: true },
      y: { get: () => mesh.position.y, set: (v) => (mesh.position.y = v), enumerable: true },
      z: { get: () => mesh.position.z, set: (v) => (mesh.position.z = v), enumerable: true },
    });
    Object.defineProperties(rotation, {
      x: { get: () => mesh.rotation.x * RAD, set: (v) => (mesh.rotation.x = v * DEG), enumerable: true },
      y: { get: () => mesh.rotation.y * RAD, set: (v) => (mesh.rotation.y = v * DEG), enumerable: true },
      z: { get: () => mesh.rotation.z * RAD, set: (v) => (mesh.rotation.z = v * DEG), enumerable: true },
    });
  } else {
    Object.assign(position, vec());
    Object.assign(rotation, vec());
  }

  // Physics body for this entity (may be created lazily via usePhysics()).
  let body = sceneManager.getBody(entity.id);
  const tmp = new Vector3();

  return {
    id: entity.id,
    name: entity.name,
    props: { ...entity.props },
    position,
    rotation,
    translate(x: number, y = 0, z = 0) {
      position.x += x;
      position.y += y;
      position.z += z;
    },
    rotate(x: number, y = 0, z = 0) {
      rotation.x += x;
      rotation.y += y;
      rotation.z += z;
    },
    setPosition(v: { x: number; y: number; z: number }) {
      position.x = v.x;
      position.y = v.y;
      position.z = v.z;
    },

    // ----- Physics -----
    /** Create a physics body at runtime (used by player controllers). */
    usePhysics(opts?: {
      type?: 'dynamic' | 'static' | 'kinematic' | 'character';
      shape?: string;
      mass?: number;
      restitution?: number;
      friction?: number;
    }) {
      body = sceneManager.ensureBody(entity.id, opts ?? {});
      return !!body;
    },
    setVelocity(x: number, y = 0, z = 0) {
      body?.setLinearVelocity(tmp.set(x, y, z));
    },
    getVelocity() {
      if (!body) return new V(0, 0, 0);
      body.getLinearVelocityToRef(tmp);
      return new V(tmp.x, tmp.y, tmp.z);
    },
    applyImpulse(x: number, y = 0, z = 0) {
      const at = mesh ? mesh.getAbsolutePosition() : Vector3.ZeroReadOnly;
      body?.applyImpulse(new Vector3(x, y, z), at);
    },
    applyForce(x: number, y = 0, z = 0) {
      const at = mesh ? mesh.getAbsolutePosition() : Vector3.ZeroReadOnly;
      body?.applyForce(new Vector3(x, y, z), at);
    },
    /** True when something solid is directly beneath the body's feet. */
    isGrounded() {
      if (!mesh) return false;
      const bb = mesh.getBoundingInfo().boundingBox;
      const feetY = bb.minimumWorld.y;
      const c = mesh.getAbsolutePosition();
      const from = new Vector3(c.x, feetY - 0.02, c.z);
      const to = new Vector3(c.x, feetY - 0.32, c.z);
      return sceneManager.physicsRaycastDistance(from, to) < Infinity;
    },
    /** Cast a ray of `length` from just outside this entity in `dir`; true if it hits. */
    raycastHit(dir: { x: number; y: number; z: number }, length: number) {
      if (!mesh) return false;
      const d = new Vector3(dir?.x ?? 0, dir?.y ?? 0, dir?.z ?? 0);
      if (d.lengthSquared() === 0) return false;
      d.normalize();
      const c = mesh.getAbsolutePosition();
      const r = (mesh.getBoundingInfo().boundingSphere.radiusWorld || 0.5) + 0.02;
      const from = new Vector3(c.x + d.x * r, c.y + d.y * r, c.z + d.z * r);
      const to = new Vector3(from.x + d.x * length, from.y + d.y * length, from.z + d.z * length);
      return sceneManager.physicsRaycastDistance(from, to) < Infinity;
    },

    // ----- Effects (VFX) -----
    /** Play a particle effect attached to this entity (by name, or the first one). */
    playEffect(name?: string) {
      const list = entity.effects ?? [];
      const fx = name ? list.find((f) => f.name === name) : list[0];
      if (fx) sceneManager.playEffect(entity.id, fx.config);
    },
    /** Stop all particle effects currently emitting from this entity. */
    stopEffect() {
      sceneManager.stopEffect(entity.id);
    },
  };
}
