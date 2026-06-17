import type { Vec3 } from './index';

/**
 * Modeling Studio domain types: free-form sculpt brushes, rig skeletons + skinning, and
 * keyframe animation clips. Split out of the main types barrel (re-exported from
 * `@/types`) to keep that file focused; import these from `@/types` as usual.
 */

/** Free-form mesh sculpt brush operation (distinct from terrain heightfield brushes). */
export type SculptBrushMode = 'draw' | 'inflate' | 'smooth' | 'flatten' | 'grab' | 'pinch';

/** Mesh sculpt brush settings (shared by the UI, store, and the Edit-Mode controller). */
export interface SculptBrushParams {
  /** Brush radius in object-local units. */
  radius: number;
  /** Per-application strength (0–1-ish; scaled by radius for displacement brushes). */
  strength: number;
  mode: SculptBrushMode;
  /** Invert the brush (draw inward, deflate, etc.). */
  invert?: boolean;
}

export function defaultSculptBrush(): SculptBrushParams {
  return { radius: 1.5, strength: 0.5, mode: 'draw' };
}

// ===== Rigging + skeletal animation =====

/** One bone of a skeleton: a rest joint position (`head`), a tip (`tail`), and a parent. */
export interface RigBone {
  id: string;
  name: string;
  parentId: string | null;
  head: Vec3;
  tail: Vec3;
}

export interface RigSkeleton {
  bones: RigBone[];
}

/** Per-vertex skin influences in Babylon's layout: 4 bone indices + 4 weights / vertex. */
export interface SkinData {
  indices: number[];
  weights: number[];
}

/** A rig bound to an entity's mesh: the skeleton, the current authored pose (Euler
 *  degrees per bone), and any keyframe clips. Skin weights live on `mesh.skin`. */
export interface RigComponent {
  skeleton: RigSkeleton;
  pose: Record<string, Vec3>;
  clips: AnimClip[];
}

/** A keyframe-animation clip: per-bone Euler-channel tracks over time. */
export type AnimChannel = 'rotX' | 'rotY' | 'rotZ';
export interface Keyframe {
  time: number;
  value: number;
}
export interface AnimTrack {
  boneId: string;
  channel: AnimChannel;
  keys: Keyframe[];
}
export interface AnimClip {
  id: string;
  name: string;
  duration: number;
  fps: number;
  tracks: AnimTrack[];
}
