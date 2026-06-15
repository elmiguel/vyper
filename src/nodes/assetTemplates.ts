import type { EngineNodeData } from './nodeTypes';

/**
 * Boilerplate code emitted by plug-and-play "asset" controller nodes. Each
 * template returns readable, tunable JS that codegen splices into onStart /
 * onUpdate. The numbers come from the node's fields, so flipping a script to
 * Code mode shows real, editable controller logic (not an opaque helper call).
 *
 * Runtime helpers these rely on (provided by ScriptRuntime):
 *   entity.usePhysics() · entity.getVelocity() · entity.setVelocity()
 *   entity.applyImpulse() · entity.isGrounded()
 *   input.mouse · input.lockPointer() · input.axisX/axisY · input.key()
 *   camera.yaw/pitch · camera.forwardXZ/rightXZ · attachFirstPerson/followThirdPerson
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
        `  camera.yaw   -= input.mouse.dx * ${n(f, 'mouseSensitivity', 0.002)};`,
        `  camera.pitch -= input.mouse.dy * ${n(f, 'mouseSensitivity', 0.002)};`,
        `  const move = camera.forwardXZ.scale(input.axisY).add(camera.rightXZ.scale(input.axisX));`,
        `  const vel = entity.getVelocity();`,
        `  entity.setVelocity(move.x * speed, vel.y, move.z * speed);`,
        `  if (input.key(' ') && entity.isGrounded()) entity.applyImpulse(0, ${jumpImpulse(f, 1.2)}, 0);`,
        `  camera.attachFirstPerson(entity, { eyeHeight: ${n(f, 'eyeHeight', 1.6)} });`,
      ].join('\n') + '\n',
  },

  // 2D top-down/side mover. No physics (2D physics is off) — moves the entity
  // directly on the XY plane from the keyboard. Works with WASD and arrow keys.
  'asset/playerController2D': {
    onStart: () => `  // 2D Player Controller — move with WASD / arrow keys\n`,
    onUpdate: (f) =>
      [
        `  // 2D Player Controller`,
        `  const speed = ${n(f, 'moveSpeed', 5)};`,
        `  entity.translate(input.axisX * speed * dt, input.axisY * speed * dt, 0);`,
      ].join('\n') + '\n',
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
        `  camera.yaw   -= input.mouse.dx * ${n(f, 'mouseSensitivity', 0.003)};`,
        `  camera.pitch -= input.mouse.dy * ${n(f, 'mouseSensitivity', 0.003)};`,
        `  const move = camera.forwardXZ.scale(input.axisY).add(camera.rightXZ.scale(input.axisX));`,
        `  const vel = entity.getVelocity();`,
        `  entity.setVelocity(move.x * speed, vel.y, move.z * speed);`,
        `  if (input.key(' ') && entity.isGrounded()) entity.applyImpulse(0, ${jumpImpulse(f, 1.2)}, 0);`,
        `  camera.followThirdPerson(entity, { distance: ${n(f, 'cameraDistance', 6)}, height: ${n(f, 'cameraHeight', 3)} });`,
      ].join('\n') + '\n',
  },
};
