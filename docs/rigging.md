# Rigging + skeletal animation

Bind a skeleton to a mesh, pose it, paint weights, and author keyframe clips that play
at runtime. Lives in the **Modeling Studio** workspace (the *Rigging* panel, tabbed with
*Modeling*). All the deformation math is pure and unit-tested; the controllers are thin
Babylon shells over it.

| Concern | File |
|---|---|
| Rig math — FK posing, distance auto-weights, linear-blend skinning | [src/babylon/editmesh/rig.ts](../src/babylon/editmesh/rig.ts) |
| Keyframe timeline — tracks, interpolation, sampling, key upsert | [src/babylon/editmesh/animTimeline.ts](../src/babylon/editmesh/animTimeline.ts) |
| Rig authoring controller (bones, pose gizmo, LBS preview) | [src/babylon/RigController.ts](../src/babylon/RigController.ts) |
| Runtime clip playback (CPU skinning) | [src/babylon/RigPlayer.ts](../src/babylon/RigPlayer.ts) |
| Scene API | [src/babylon/SceneManager.ts](../src/babylon/SceneManager.ts) — `rigController`, `startClip`/`stopClip`/`clearClips` |
| Store | [src/store/slices/rigSlice.ts](../src/store/slices/rigSlice.ts) — `beginRig`, `commitRig`, `addClip`, `keyframeBones`, `setPlayhead` |
| Types | [src/types/index.ts](../src/types/index.ts) — `RigComponent`, `RigSkeleton`, `RigBone`, `SkinData`, `AnimClip`, `AnimTrack` |
| UI | [src/panels/RiggingPanel.tsx](../src/panels/RiggingPanel.tsx) |
| Runtime nodes | `world/playClip` / `world/stopClip` ([nodeSpecs.extra.ts](../src/nodes/nodeSpecs.extra.ts), [codegen.ts](../src/nodes/codegen.ts)) → `entity.playClip` / `entity.stopClip` ([entityApi.ts](../src/runtime/entityApi.ts)) |

## The model

A rig is an `Entity.rig` = `{ skeleton, pose, clips }`; skin weights live on `mesh.skin`
(Babylon's 4-influence layout). Bones are **rigid** (rotation + translation, no scale)
and rest world-aligned; posing a bone rotates it about its `head`, carrying its children
(forward kinematics, `poseBones`). Weights are distance-based (`autoWeights`): each
vertex binds to the nearest bone segments by inverse-square distance, normalized over ≤4
influences. Deformation is **linear-blend skinning** (`linearBlendSkin`): for each
influence, `worldRot·(v − restHead) + posedHead`, weighted.

Skin weights index the mesh's **welded** vertices (`mesh.custom.polyVerts` — see the
[quad system](modeling.md)), so the editor preview, the saved skin, and runtime playback
all share one vertex set.

## Authoring flow

1. **Enter Rig Mode** on a mesh → the source mesh hides, a skinned preview appears.
2. **Add Bone** chains a bone up from the selected bone's tip; select a bone and use the
   rotation gizmo to pose it (the preview deforms live).
3. **Auto Weight** binds the mesh to the skeleton by distance.
4. **New Clip**, scrub the timeline, pose bones, and **Key Pose** to write keyframes for
   every bone at the playhead. Play loops the clip in the editor.

Everything commits onto the entity (`commitRig`), so rigs/clips persist with the scene.

## Runtime playback

In a script/graph, `entity.playClip(name, loop)` (node **Play Animation**) starts
playback; `entity.stopClip()` (**Stop Animation**) ends it. `RigPlayer` shows a welded
skinned mesh and, each render frame, samples the clip → poses the skeleton → linear-blend-
skins the rest positions onto it — reusing the same tested pure cores as the editor.
Playback is cleared on Stop.

## Not yet implemented (follow-ups)

- **GPU skinning** via a real Babylon `Skeleton` + `AnimationGroup` (today playback is
  CPU per-frame — fine at indie mesh scale, but a fixed cost per rigged entity).
- **Manual weight painting** and **weight normalization tools** (only auto-weights today).
- **IK, bone constraints, blend shapes, and animation blending** (the simple-skeleton
  scope; deferred).
- **Manual bone placement** in the viewport (bones currently chain programmatically).
