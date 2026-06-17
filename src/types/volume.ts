// Trigger-volume behaviour types: movement boundaries and presets. Split out of
// the main barrel to keep it small; re-exported from `@/types`.

/**
 * Movement constraint a volume imposes on the objects it affects:
 * - `none`      — no constraint (plain sensor).
 * - `keepIn`    — affected objects inside cannot leave.
 * - `keepOut`   — affected objects outside cannot enter.
 * - `oneWayOut` — may leave, but once out cannot re-enter.
 * - `trap`      — may enter, but once in cannot leave.
 */
export type BoundaryMode = 'none' | 'keepIn' | 'keepOut' | 'oneWayOut' | 'trap';

/** Behavioural/visual preset layered on a volume. */
export type VolumePreset = 'none' | 'deadZone' | 'fog' | 'water' | 'sound';

/** Extra behaviour for a trigger volume: a movement boundary and/or a preset
 *  (dead zone, localized fog, water, zone sound). Enforced per-frame at runtime. */
export interface VolumeConfig {
  preset: VolumePreset;
  boundary: BoundaryMode;
  /** Dead Zone: respawn the object at its spawn point (true) or destroy it (false). */
  respawn: boolean;
  /** Fog/Water tint colour (hex) shown when the camera is inside. */
  color: string;
  /** Fog/Water murk density. */
  density: number;
  /** Water: per-frame velocity damping 0–1 (higher = thicker). */
  drag: number;
  /** Water: upward buoyancy acceleration (m/s²) countering gravity. */
  buoyancy: number;
  /** Sound: audio file URL played while the camera is inside. */
  soundUrl: string;
  /** Sound: volume 0–1. */
  soundVolume: number;
  /** Sound: loop the clip. */
  soundLoop: boolean;
}

/** Sensible defaults for a freshly-configured volume. */
export function defaultVolume(): VolumeConfig {
  return {
    preset: 'none',
    boundary: 'none',
    respawn: true,
    color: '#3a6ea5',
    density: 0.08,
    drag: 0.12,
    buoyancy: 9,
    soundUrl: '',
    soundVolume: 0.6,
    soundLoop: true,
  };
}
