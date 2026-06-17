import { describe, it, expect } from 'vitest';
import { emptyClip, sampleTrack, sampleClipEuler, upsertKey, removeKeysAt, findTrack, type AnimTrack } from './animTimeline';

const track: AnimTrack = {
  boneId: 'b',
  channel: 'rotZ',
  keys: [
    { time: 0, value: 0 },
    { time: 1, value: 90 },
    { time: 2, value: 0 },
  ],
};

describe('sampleTrack', () => {
  it('interpolates linearly between keys', () => {
    expect(sampleTrack(track, 0.5)).toBeCloseTo(45, 5);
    expect(sampleTrack(track, 1.5)).toBeCloseTo(45, 5);
  });
  it('clamps before the first and after the last key', () => {
    expect(sampleTrack(track, -1)).toBe(0);
    expect(sampleTrack(track, 5)).toBe(0);
  });
  it('returns 0 for an empty track', () => {
    expect(sampleTrack({ boneId: 'b', channel: 'rotX', keys: [] }, 1)).toBe(0);
  });
});

describe('sampleClipEuler', () => {
  it('merges per-channel tracks into a bone Euler', () => {
    const clip = {
      id: 'c', name: 'C', duration: 1, fps: 30,
      tracks: [
        { boneId: 'b', channel: 'rotX' as const, keys: [{ time: 0, value: 10 }, { time: 1, value: 20 }] },
        { boneId: 'b', channel: 'rotZ' as const, keys: [{ time: 0, value: 0 }, { time: 1, value: 100 }] },
      ],
    };
    const e = sampleClipEuler(clip, 0.5);
    expect(e.b.x).toBeCloseTo(15, 5);
    expect(e.b.y).toBe(0); // no rotY track → 0
    expect(e.b.z).toBeCloseTo(50, 5);
  });
});

describe('upsertKey', () => {
  it('creates a track and inserts a sorted key, extending duration', () => {
    let clip = emptyClip('c');
    clip = upsertKey(clip, 'b', 'rotY', 3, 45);
    expect(findTrack(clip, 'b', 'rotY')!.keys).toEqual([{ time: 3, value: 45 }]);
    expect(clip.duration).toBe(3);
  });
  it('replaces a key at the same time instead of duplicating', () => {
    let clip = emptyClip('c');
    clip = upsertKey(clip, 'b', 'rotY', 1, 10);
    clip = upsertKey(clip, 'b', 'rotY', 1, 90);
    const t = findTrack(clip, 'b', 'rotY')!;
    expect(t.keys).toHaveLength(1);
    expect(t.keys[0].value).toBe(90);
  });
  it('keeps keys sorted by time', () => {
    let clip = emptyClip('c');
    clip = upsertKey(clip, 'b', 'rotY', 2, 0);
    clip = upsertKey(clip, 'b', 'rotY', 1, 0);
    expect(findTrack(clip, 'b', 'rotY')!.keys.map((k) => k.time)).toEqual([1, 2]);
  });
  it('does not mutate the input clip', () => {
    const clip = emptyClip('c');
    const next = upsertKey(clip, 'b', 'rotY', 1, 10);
    expect(clip.tracks).toHaveLength(0);
    expect(next.tracks).toHaveLength(1);
  });
});

describe('removeKeysAt', () => {
  it('removes keys at a time and drops emptied tracks', () => {
    let clip = emptyClip('c');
    clip = upsertKey(clip, 'b', 'rotY', 1, 10);
    clip = removeKeysAt(clip, 1);
    expect(clip.tracks).toHaveLength(0);
  });
});
