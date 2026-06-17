# Trigger volumes — boundaries & presets

A **volume** is a trigger-enabled mesh (box / sphere / cylinder). Beyond firing
enter/exit/stay events, it can constrain movement and apply a preset behaviour.
Configured in the Inspector (Trigger Volume section) and enforced each frame
during Play by the `VolumeEnforcer`.

| Concern | File |
|---|---|
| Config type | [src/types/volume.ts](../src/types/volume.ts) — `VolumeConfig`, `BoundaryMode`, `VolumePreset`, `defaultVolume()` |
| Pure geometry | [src/runtime/volumeGeometry.ts](../src/runtime/volumeGeometry.ts) — point-in-volume, clamp/push, boundary state machine |
| Runtime enforcement | [src/runtime/VolumeEnforcer.ts](../src/runtime/VolumeEnforcer.ts) |
| Reposition (body-aware) | [src/babylon/SceneManager.ts](../src/babylon/SceneManager.ts) — `repositionEntity` |
| Store action | [src/store/slices/entitySlice.ts](../src/store/slices/entitySlice.ts) — `updateVolume` |
| UI | [src/panels/VolumePanel.tsx](../src/panels/VolumePanel.tsx) (Inspector → Trigger Volume) |

## Boundary modes

Applied to the objects the volume affects (its trigger `filter` — name/tag, empty = any):

- **Keep inside** (`keepIn`) — an affected object inside can't leave.
- **Keep outside** (`keepOut`) — an affected object outside can't enter.
- **One-way out** (`oneWayOut`) — may leave, but once out can't re-enter (latches on exit).
- **Trap** (`trap`) — may enter, but once in can't leave (latches on entry).

Each frame the enforcer transforms the object's world position into the volume's
local unit space (folding in the volume's position/rotation/scale), tests
inside/outside, and — if the object violates its constraint — clamps it to the
nearest boundary point (`clampInsideLocal` / `pushOutsideLocal`) via
`repositionEntity`, which also moves the physics body (`setTargetTransform`) and
zeroes its velocity. The latch state for `trap`/`oneWayOut` is a pure state
machine (`resolveConstraint`).

## Presets

- **Dead Zone** — an affected object inside is respawned at its Play-start
  position (or destroyed if *Respawn* is off).
- **Fog** — while the camera is inside, scene fog is enabled with the volume's
  colour + density; cleared when the camera leaves. *(Approximation: Babylon fog
  is global, so it shows while the viewer is inside the zone rather than being
  truly volumetric.)*
- **Water** — dynamic bodies inside get viscous **drag** + upward **buoyancy**;
  while the camera is inside, the water colour/density tints the view (same fog
  channel as Fog).
- **Sound** — an audio file (`soundUrl`) plays/loops while the camera is inside,
  at the configured volume. Uses an `HTMLAudioElement`. Upload audio clips
  (`.mp3/.wav/.ogg/.m4a/.aac/.flac`) via the asset browser — they appear as
  `type: 'audio'` assets and can be picked from the volume's **Clip** dropdown — or
  type any external URL.

## Notes / limits

- Boundary correction zeroes the object's velocity on contact (a hard wall) rather
  than reflecting only the outward component — simple and tunnel-proof; per-axis
  reflection is a possible refinement.
- Fog/Water tint share Babylon's single global fog; if the camera is inside more
  than one fog/water volume, the last one wins.
