import { nanoid } from 'nanoid';
import type { AnimClip, RigSkeleton, SkinData, Vec3 } from '@/types';
import { emptyClip, sampleClipEuler, upsertKey } from '@/babylon/editmesh/animTimeline';
import type { EditorState, StoreSet, StoreGet } from '../editorTypes';

type RigSlice = Pick<
  EditorState,
  | 'beginRig'
  | 'endRig'
  | 'selectRigBone'
  | 'commitRig'
  | 'addClip'
  | 'setActiveClip'
  | 'keyframeBones'
  | 'setPlayhead'
  | 'setRigPlaying'
>;

const activeClipOf = (get: StoreGet) => {
  const r = get().rig;
  const ent = get().entities.find((e) => e.id === r.entityId);
  return ent?.rig?.clips.find((c) => c.id === r.activeClipId) ?? null;
};

/** Rigging + skeletal-animation authoring. The RigController owns the live skeleton and
 *  preview; this slice mirrors session intent and persists committed rigs/clips on the
 *  entity. Pose sampling for scrubbing uses the pure animTimeline core. */
export function createRigSlice(set: StoreSet, get: StoreGet): RigSlice {
  return {
    beginRig: (entityId) =>
      set({
        rig: { active: true, entityId, selectedBone: null, activeClipId: null, playhead: 0, playing: false, scrubPose: null },
        selectedId: entityId,
      }),

    endRig: () => set((s) => ({ rig: { ...s.rig, active: false, playing: false, scrubPose: null } })),

    selectRigBone: (boneId) => set((s) => ({ rig: { ...s.rig, selectedBone: boneId } })),

    commitRig: (entityId: string, skeleton: RigSkeleton, skin: SkinData, pose: Record<string, Vec3>) =>
      set((s) => ({
        entities: s.entities.map((e) => {
          if (e.id !== entityId || !e.mesh) return e;
          const clips = e.rig?.clips ?? [];
          return { ...e, mesh: { ...e.mesh, skin }, rig: { skeleton, pose, clips } };
        }),
      })),

    addClip: (name) => {
      const id = `clip-${nanoid(6)}`;
      const entityId = get().rig.entityId;
      set((s) => ({
        entities: s.entities.map((e) =>
          e.id === entityId && e.rig
            ? { ...e, rig: { ...e.rig, clips: [...e.rig.clips, emptyClip(id, name || `Clip ${e.rig.clips.length + 1}`)] } }
            : e,
        ),
        rig: { ...s.rig, activeClipId: id },
      }));
      return id;
    },

    setActiveClip: (clipId) => set((s) => ({ rig: { ...s.rig, activeClipId: clipId, playhead: 0 } })),

    keyframeBones: () => {
      const r = get().rig;
      const ent = get().entities.find((e) => e.id === r.entityId);
      const pose = ent?.rig?.pose;
      if (!ent?.rig || !r.activeClipId || !pose) return;
      set((s) => ({
        entities: s.entities.map((e) => {
          if (e.id !== r.entityId || !e.rig) return e;
          const clips = e.rig.clips.map((c) => {
            if (c.id !== r.activeClipId) return c;
            let next: AnimClip = c;
            for (const [boneId, euler] of Object.entries(pose)) {
              next = upsertKey(next, boneId, 'rotX', r.playhead, euler.x);
              next = upsertKey(next, boneId, 'rotY', r.playhead, euler.y);
              next = upsertKey(next, boneId, 'rotZ', r.playhead, euler.z);
            }
            return next;
          });
          return { ...e, rig: { ...e.rig, clips } };
        }),
      }));
    },

    setPlayhead: (time: number) => {
      const clip = activeClipOf(get);
      const scrubPose = clip ? sampleClipEuler(clip, time) : null;
      set((s) => ({ rig: { ...s.rig, playhead: Math.max(0, time), scrubPose } }));
    },

    setRigPlaying: (playing) => set((s) => ({ rig: { ...s.rig, playing } })),
  };
}
