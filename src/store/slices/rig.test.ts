import { describe, it, expect, beforeEach } from 'vitest';
import type { Entity, RigSkeleton, SkinData } from '@/types';
import { useEditorStore } from '../editorStore';

const s = () => useEditorStore.getState();

const meshEntity = (): Entity => ({
  id: 'm', name: 'Mesh', parentId: null,
  transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
  mesh: { kind: 'custom', color: '#fff', visible: true, custom: { positions: [], indices: [], normals: [], polyVerts: [0, 0, 0], polygons: [[0]] } },
  scriptIds: [], props: {},
});

const skel: RigSkeleton = { bones: [{ id: 'b', name: 'Bone', parentId: null, head: { x: 0, y: 0, z: 0 }, tail: { x: 0, y: 1, z: 0 } }] };
const skin: SkinData = { indices: [0, 0, 0, 0], weights: [1, 0, 0, 0] };

beforeEach(() => {
  useEditorStore.setState({
    entities: [meshEntity()],
    selectedId: null,
    rig: { active: false, entityId: null, selectedBone: null, activeClipId: null, playhead: 0, playing: false, scrubPose: null },
  });
});

describe('beginRig / endRig', () => {
  it('enters rig mode for an entity and selects it', () => {
    s().beginRig('m');
    expect(s().rig).toMatchObject({ active: true, entityId: 'm' });
    expect(s().selectedId).toBe('m');
  });
  it('exits and clears scrub pose', () => {
    s().beginRig('m');
    s().endRig();
    expect(s().rig.active).toBe(false);
    expect(s().rig.scrubPose).toBeNull();
  });
});

describe('commitRig', () => {
  it('persists skeleton + pose on the entity and skin on the mesh', () => {
    s().beginRig('m');
    s().commitRig('m', skel, skin, { b: { x: 0, y: 0, z: 45 } });
    const e = s().entities.find((x) => x.id === 'm')!;
    expect(e.rig!.skeleton.bones).toHaveLength(1);
    expect(e.rig!.pose.b).toEqual({ x: 0, y: 0, z: 45 });
    expect(e.mesh!.skin).toEqual(skin);
  });
});

describe('clips + keyframes', () => {
  it('adds a clip and keys the current pose into it', () => {
    s().beginRig('m');
    s().commitRig('m', skel, skin, { b: { x: 0, y: 0, z: 90 } });
    const clipId = s().addClip('Wave');
    expect(s().rig.activeClipId).toBe(clipId);
    s().setPlayhead(1);
    s().keyframeBones();
    const clip = s().entities.find((x) => x.id === 'm')!.rig!.clips.find((c) => c.id === clipId)!;
    const rotZ = clip.tracks.find((t) => t.boneId === 'b' && t.channel === 'rotZ')!;
    expect(rotZ.keys).toContainEqual({ time: 1, value: 90 });
  });

  it('setPlayhead samples the active clip into a scrub pose', () => {
    s().beginRig('m');
    s().commitRig('m', skel, skin, { b: { x: 0, y: 0, z: 90 } });
    s().addClip('Wave');
    s().setPlayhead(0);
    s().keyframeBones();
    s().setPlayhead(2);
    s().commitRig('m', skel, skin, { b: { x: 0, y: 0, z: 0 } }); // pose back to 0 at t=2 frame of mind
    s().keyframeBones();
    // Sample halfway: rotZ should interpolate between the two keys.
    s().setPlayhead(1);
    expect(s().rig.scrubPose!.b.z).toBeCloseTo(45, 5);
  });
});
