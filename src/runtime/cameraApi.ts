import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
import type { SceneManager } from '@/babylon/SceneManager';
import { V } from './vector';

/**
 * Camera helper handed to controller scripts. Wraps the game `UniversalCamera`
 * with yaw/pitch look state and first/third-person placement. One instance is
 * shared per play session (there is a single game camera).
 */
export function makeCameraApi(cam: UniversalCamera, sceneManager: SceneManager, resolveId: (t: unknown) => string) {
  let yaw = cam.rotation.y;
  let pitch = cam.rotation.x;
  const clampPitch = (p: number) => Math.max(-1.45, Math.min(1.45, p));
  // Generic camera-change state, driven each frame by update(dt).
  let followId: string | null = null;
  let followDist = 6;
  let followHeight = 3;
  let shakeTime = 0;
  let shakeAmp = 0;
  let lastShake: Vector3 | null = null;

  /** Resolve a target (entity name/id, or a {x,y,z}) to a world position. */
  const posOf = (target: unknown): Vector3 | null => {
    if (target && typeof target === 'object' && 'x' in (target as object)) {
      const v = target as { x: number; y: number; z: number };
      return new Vector3(v.x, v.y, v.z);
    }
    const m = sceneManager.getMesh(resolveId(target));
    return m ? m.getAbsolutePosition().clone() : null;
  };

  return {
    get yaw() {
      return yaw;
    },
    set yaw(v: number) {
      yaw = v;
    },
    get pitch() {
      return pitch;
    },
    set pitch(v: number) {
      pitch = clampPitch(v);
    },
    /** Normalised ground-plane forward (ignores pitch) for movement. */
    get forwardXZ() {
      return new V(Math.sin(yaw), 0, Math.cos(yaw)).normalize();
    },
    /** Normalised ground-plane right vector for strafing. */
    get rightXZ() {
      return new V(Math.cos(yaw), 0, -Math.sin(yaw)).normalize();
    },
    /** Place the camera at the entity's eye and aim it with yaw/pitch. */
    attachFirstPerson(ent: { position: { x: number; y: number; z: number } }, opts?: { eyeHeight?: number }) {
      const eye = opts?.eyeHeight ?? 1.6;
      cam.rotation.set(pitch, yaw, 0);
      cam.position.set(ent.position.x, ent.position.y + eye, ent.position.z);
    },
    /** Orbit the camera behind the entity at a distance/height. */
    followThirdPerson(
      ent: { position: { x: number; y: number; z: number } },
      opts?: { distance?: number; height?: number },
    ) {
      const dist = opts?.distance ?? 6;
      const height = opts?.height ?? 3;
      cam.rotation.set(pitch, yaw, 0);
      const bx = -Math.sin(yaw) * dist;
      const bz = -Math.cos(yaw) * dist;
      cam.position.set(ent.position.x + bx, ent.position.y + height, ent.position.z + bz);
    },

    // ----- Generic camera changes (usable from any script / trigger) -----
    /** Snap the camera to a world position. Cancels follow. */
    moveTo(pos: { x: number; y: number; z: number }) {
      followId = null;
      cam.position.set(pos.x, pos.y, pos.z);
    },
    /** Aim the camera at a target object or position. */
    lookAt(target: unknown) {
      const p = posOf(target);
      if (p) cam.setTarget(p);
    },
    /** Smoothly trail an object each frame at a distance/height behind it. */
    follow(target: unknown, opts?: { distance?: number; height?: number }) {
      followId = resolveId(target);
      if (opts?.distance != null) followDist = opts.distance;
      if (opts?.height != null) followHeight = opts.height;
    },
    /** Stop following (camera stays where it is). */
    stopFollow() {
      followId = null;
    },
    /** Screen-shake of `intensity` world units for `seconds`. */
    shake(intensity: number, seconds = 0.3) {
      shakeAmp = Math.max(0, intensity);
      shakeTime = Math.max(0, seconds);
    },
    /** Per-frame driver for follow + shake; called by the runtime loop. */
    update(dt: number) {
      // Undo last frame's shake offset so it never accumulates.
      if (lastShake) {
        cam.position.subtractInPlace(lastShake);
        lastShake = null;
      }
      if (followId) {
        const m = sceneManager.getMesh(followId);
        if (m) {
          const tp = m.getAbsolutePosition();
          cam.position.set(tp.x, tp.y + followHeight, tp.z - followDist);
          cam.setTarget(tp.clone());
        }
      }
      if (shakeTime > 0) {
        shakeTime -= dt;
        const off = new Vector3((Math.random() * 2 - 1) * shakeAmp, (Math.random() * 2 - 1) * shakeAmp, 0);
        cam.position.addInPlace(off);
        lastShake = off;
      }
    },
  };
}
