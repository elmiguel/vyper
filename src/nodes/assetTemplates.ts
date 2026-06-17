import type { EngineNodeData } from './nodeTypes';

/**
 * Boilerplate code emitted by plug-and-play "asset" controller nodes. Each
 * template returns readable, tunable JS that codegen splices into onStart /
 * onUpdate. The numbers come from the node's fields, so flipping a script to
 * Code mode shows real, editable controller logic (not an opaque helper call).
 *
 * Runtime helpers these rely on (provided by ScriptRuntime):
 *   entity.usePhysics() · entity.getVelocity() · entity.setVelocity()
 *   entity.applyImpulse() · entity.isGrounded() · entity.translate() · entity.position
 *   entity.props (per-entity scratch store that persists across frames)
 *   input.mouse · input.lockPointer() · input.axisX/axisY · input.key()
 *   camera.yaw/pitch · camera.forwardXZ/rightXZ · attachFirstPerson/followThirdPerson
 *
 * Jumping: the 3D controllers use spacebar + physics (input.key(' ') +
 * applyImpulse when grounded); the 2D controller has no physics, so it
 * integrates its own gravity and jumps by storing a vertical velocity on
 * entity.props (see jumpVelocity2D).
 */

type Fields = EngineNodeData['fields'];

const n = (f: Fields, key: string, fallback: number): string => {
  const v = Number(f?.[key as keyof typeof f]);
  return String(Number.isFinite(v) ? v : fallback);
};

/** Upward impulse needed to reach a given jump height (v = √(2gh), mass ≈ 1). */
const jumpImpulse = (f: Fields, fallback: number): string => {
  const h = Number(f?.jump ?? f?.jumpHeight);
  const height = Number.isFinite(h) ? h : fallback;
  return (Math.sqrt(2 * 9.81 * Math.max(0, height))).toFixed(2);
};

/**
 * Shared physics locomotion for the first/third-person controllers: horizontal
 * movement + jump, tuned for a smooth, modern feel.
 *
 * - Grounded: velocity snaps to the input direction (responsive, no lag).
 * - Airborne: only a small fraction of control is applied, so a jump keeps its
 *   take-off momentum and arcs naturally instead of being re-steered every frame
 *   (which felt "wonky" when jumping while moving).
 * - Jump SETS a precise take-off velocity (v = √(2gh)) rather than adding an
 *   impulse — deterministic height, crisp launch, no levitation. Edge-triggered
 *   (entity.props.jumpHeld) so a held key fires exactly one jump. Expects a
 *   `speed` const to already be in scope.
 */
const physicsLocomotion = (f: Fields): string[] => [
  `  const grounded = entity.isGrounded();`,
  `  const wish = camera.forwardXZ.scale(input.axisY).add(camera.rightXZ.scale(input.axisX));`,
  `  const vel = entity.getVelocity();`,
  `  if (grounded) entity.setVelocity(wish.x * speed, vel.y, wish.z * speed);`,
  `  else entity.setVelocity(vel.x + (wish.x * speed - vel.x) * 0.1, vel.y, vel.z + (wish.z * speed - vel.z) * 0.1);`,
  `  const jumpPressed = input.key(' ');`,
  `  if (jumpPressed && !entity.props.jumpHeld && grounded) { const v = entity.getVelocity(); entity.setVelocity(v.x, ${jumpImpulse(f, 1.2)}, v.z); }`,
  `  entity.props.jumpHeld = jumpPressed;`,
];

/**
 * Take-off velocity for the physics-free 2D controller to reach `jumpHeight`
 * under its own `gravity` (v = √(2gh)). Unlike `jumpImpulse`, gravity here is a
 * tunable field, not Babylon's 9.81 — the 2D mover integrates motion itself.
 */
const jumpVelocity2D = (f: Fields, gravity: number, fallback: number): string => {
  const h = Number(f?.jumpHeight ?? f?.jump);
  const height = Number.isFinite(h) ? h : fallback;
  return Math.sqrt(2 * gravity * Math.max(0, height)).toFixed(2);
};

export interface AssetTemplate {
  onStart: (f: Fields) => string;
  onUpdate: (f: Fields) => string;
}

export const ASSET_TEMPLATES: Record<string, AssetTemplate> = {
  'asset/firstPersonController': {
    onStart: (f) =>
      [
        `  // First-Person Controller — setup`,
        `  entity.usePhysics({ type: 'character', shape: 'capsule', mass: 1 });`,
        `  input.lockPointer();`,
        `  camera.attachFirstPerson(entity, { eyeHeight: ${n(f, 'eyeHeight', 1.6)} });`,
      ].join('\n') + '\n',
    onUpdate: (f) =>
      [
        `  // First-Person Controller`,
        `  const speed = input.key('shift') ? ${n(f, 'sprintSpeed', 8)} : ${n(f, 'moveSpeed', 5)};`,
        `  camera.yaw   += input.mouse.dx * ${n(f, 'mouseSensitivity', 0.002)};`,
        `  camera.pitch += input.mouse.dy * ${n(f, 'mouseSensitivity', 0.002)};`,
        ...physicsLocomotion(f),
        `  camera.attachFirstPerson(entity, { eyeHeight: ${n(f, 'eyeHeight', 1.6)} });`,
      ].join('\n') + '\n',
  },

  // 2D side-scroller mover. No physics (2D physics is off) — moves on X from the
  // keyboard and integrates its own gravity on Y so Space can jump. The entity
  // lands back at the height it spawned at (its "ground"). Run with A/D or ← →.
  'asset/playerController2D': {
    onStart: () =>
      [
        `  // 2D Player Controller — run with A/D or ← →, jump with Space`,
        `  entity.props.vy = 0;                       // vertical velocity (units/sec)`,
        `  entity.props.groundY = entity.position.y;  // height to land back on`,
      ].join('\n') + '\n',
    onUpdate: (f) => {
      const gravity = Number(n(f, 'gravity', 20));
      return (
        [
          `  // 2D Player Controller`,
          `  const speed = ${n(f, 'moveSpeed', 5)}, gravity = ${gravity};`,
          `  entity.translate(input.axisX * speed * dt, 0, 0);`,
          `  const grounded = entity.position.y <= entity.props.groundY + 0.001;`,
          `  const jumpPressed = input.key(' ');`,
          `  if (grounded && jumpPressed && !entity.props.jumpHeld) entity.props.vy = ${jumpVelocity2D(f, gravity, 2)};`,
          `  entity.props.jumpHeld = jumpPressed;`,
          `  entity.props.vy -= gravity * dt;`,
          `  entity.translate(0, entity.props.vy * dt, 0);`,
          `  if (entity.position.y < entity.props.groundY) { entity.position.y = entity.props.groundY; entity.props.vy = 0; }`,
        ].join('\n') + '\n'
      );
    },
  },

  'asset/thirdPersonController': {
    onStart: () =>
      [
        `  // Third-Person Controller — setup`,
        `  entity.usePhysics({ type: 'character', shape: 'capsule', mass: 1 });`,
        `  input.lockPointer();`,
      ].join('\n') + '\n',
    onUpdate: (f) =>
      [
        `  // Third-Person Controller`,
        `  const speed = input.key('shift') ? ${n(f, 'sprintSpeed', 8)} : ${n(f, 'moveSpeed', 5)};`,
        `  camera.yaw   += input.mouse.dx * ${n(f, 'mouseSensitivity', 0.003)};`,
        `  camera.pitch += input.mouse.dy * ${n(f, 'mouseSensitivity', 0.003)};`,
        ...physicsLocomotion(f),
        `  camera.followThirdPerson(entity, { distance: ${n(f, 'cameraDistance', 6)}, height: ${n(f, 'cameraHeight', 3)} });`,
      ].join('\n') + '\n',
  },
};
