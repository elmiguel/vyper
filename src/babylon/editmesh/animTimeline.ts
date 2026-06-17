/**
 * Pure keyframe-animation timeline — tracks of scalar keyframes (bone Euler channels)
 * with linear interpolation and end-clamping, plus sampling helpers. No Babylon
 * dependency, so interpolation is unit-testable; the AnimationController converts a
 * sampled pose into a live skeleton pose (and bakes Babylon AnimationGroups for play).
 */

import type { AnimChannel, AnimClip, AnimTrack } from '@/types';

export type { AnimChannel, AnimClip, AnimTrack, Keyframe } from '@/types';

export function emptyClip(id: string, name = 'Clip'): AnimClip {
  return { id, name, duration: 2, fps: 30, tracks: [] };
}

/** Sample a single track at time `t` (seconds): linear interp, clamped at the ends. */
export function sampleTrack(track: AnimTrack, t: number): number {
  const keys = track.keys;
  if (keys.length === 0) return 0;
  if (t <= keys[0].time) return keys[0].value;
  const last = keys[keys.length - 1];
  if (t >= last.time) return last.value;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (t >= a.time && t <= b.time) {
      const span = b.time - a.time || 1;
      const f = (t - a.time) / span;
      return a.value + (b.value - a.value) * f;
    }
  }
  return last.value;
}

/** Sample every bone's Euler rotation (degrees) from the clip at time `t`. */
export function sampleClipEuler(clip: AnimClip, t: number): Record<string, { x: number; y: number; z: number }> {
  const out: Record<string, { x: number; y: number; z: number }> = {};
  for (const track of clip.tracks) {
    const e = (out[track.boneId] ??= { x: 0, y: 0, z: 0 });
    const v = sampleTrack(track, t);
    if (track.channel === 'rotX') e.x = v;
    else if (track.channel === 'rotY') e.y = v;
    else e.z = v;
  }
  return out;
}

/** Find the track for a bone+channel, or undefined. */
export function findTrack(clip: AnimClip, boneId: string, channel: AnimChannel): AnimTrack | undefined {
  return clip.tracks.find((t) => t.boneId === boneId && t.channel === channel);
}

/**
 * Insert or replace a keyframe at `time` on the bone+channel track (creating the track
 * if needed), returning a new clip (immutable update for the store). Keys stay sorted.
 */
export function upsertKey(clip: AnimClip, boneId: string, channel: AnimChannel, time: number, value: number): AnimClip {
  const tracks = clip.tracks.map((t) => ({ ...t, keys: t.keys.slice() }));
  let track = tracks.find((t) => t.boneId === boneId && t.channel === channel);
  if (!track) {
    track = { boneId, channel, keys: [] };
    tracks.push(track);
  }
  const existing = track.keys.findIndex((k) => Math.abs(k.time - time) < 1e-4);
  if (existing >= 0) track.keys[existing] = { time, value };
  else track.keys.push({ time, value });
  track.keys.sort((a, b) => a.time - b.time);
  return { ...clip, tracks, duration: Math.max(clip.duration, time) };
}

/** Remove every keyframe at `time` (within epsilon), dropping emptied tracks. */
export function removeKeysAt(clip: AnimClip, time: number): AnimClip {
  const tracks = clip.tracks
    .map((t) => ({ ...t, keys: t.keys.filter((k) => Math.abs(k.time - time) >= 1e-4) }))
    .filter((t) => t.keys.length > 0);
  return { ...clip, tracks };
}
