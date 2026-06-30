import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
import type { SceneManager } from '@/babylon/SceneManager';
import { V } from './vector';

/** A finite degree value, or the fallback (guards NaN/undefined from cleared fields). */
const degOrDefault = (deg: number | undefined, fallback: number) =>
  Number.isFinite(deg) ? (deg as number) : fallback;

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
    attachFirstPerson(ent: { position: { x: number; y: number; z: number } }, opts?: { eyeHeight?: number; fov?: number }) {
      const eye = opts?.eyeHeight ?? 1.6;
      // A controlled camera owns its FOV — otherwise the active look preset's
      // cinematic FOV (e.g. a wide 75°) bleeds in and the view reads fish-eyed.
      cam.fov = (degOrDefault(opts?.fov, 75) * Math.PI) / 180;
      cam.rotation.set(pitch, yaw, 0);
      cam.position.set(ent.position.x, ent.position.y + eye, ent.position.z);
    },
    /** Trail the camera behind + above the entity, always looking AT it.
     *
     *  The camera sits `distance` back (along yaw, with pitch orbiting it
     *  up/down) and `height` above the entity, and aims directly at the entity's
     *  position — so the character is always centred in frame. Aiming at a point
     *  ABOVE the entity (or along a free pitch that never pointed at it) dropped
     *  the character below the frame, making the third-person view look first-
     *  person / show nothing. */
    followThirdPerson(
      ent: { position: { x: number; y: number; z: number } },
      opts?: { distance?: number; height?: number; fov?: number },
    ) {
      // Guard against a degenerate distance (0, negative, or NaN from a cleared
      // field) — without this the camera collapses onto the entity.
      const dist = Number.isFinite(opts?.distance) && (opts!.distance as number) > 0 ? (opts!.distance as number) : 6;
      const height = Number.isFinite(opts?.height) ? (opts!.height as number) : 3;
      // A controlled camera owns its FOV, so the active look preset's cinematic
      // FOV (e.g. a wide 75°) can't bleed in and fish-eye the third-person view.
      cam.fov = (degOrDefault(opts?.fov, 60) * Math.PI) / 180;
      const cp = Math.cos(pitch);
      const tx = ent.position.x;
      const ty = ent.position.y;
      const tz = ent.position.z;
      // Behind by `dist` (yaw + pitch), raised by `height`; look straight at the entity.
      cam.position.set(tx - Math.sin(yaw) * cp * dist, ty + Math.sin(pitch) * dist + height, tz - Math.cos(yaw) * cp * dist);
      cam.setTarget(new Vector3(tx, ty, tz));
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
