import { describe, it, expect } from 'vitest';
import { readGizmoTransform, type TransformSource } from './sceneViewHelpers';
import { GAME_CAMERA_ID } from './editorObjects';

const src = (over: Partial<TransformSource> = {}): TransformSource => ({
  name: 'mesh-1',
  position: { x: 1, y: 2, z: 3 },
  scaling: { x: 1, y: 1, z: 1 },
  rotation: { x: 0, y: Math.PI, z: 0 },
  rotationQuaternion: null,
  ...over,
});

describe('readGizmoTransform', () => {
  it('reports an entity transform with degrees-euler rotation and scale', () => {
    const t = readGizmoTransform(src({ scaling: { x: 2, y: 3, z: 4 } }), '3d', -10);
    expect(t.kind).toBe('entity');
    if (t.kind !== 'entity') throw new Error('expected entity');
    expect(t.position).toEqual({ x: 1, y: 2, z: 3 });
    expect(t.rotation.y).toBeCloseTo(180, 5); // π rad → 180°
    expect(t.scale).toEqual({ x: 2, y: 3, z: 4 });
  });

  it('converts a rotation quaternion to euler degrees', () => {
    const t = readGizmoTransform(
      src({ rotationQuaternion: { toEulerAngles: () => ({ x: Math.PI / 2, y: 0, z: 0 }) } }),
      '3d',
      -10,
    );
    expect(t.rotation.x).toBeCloseTo(90, 5);
  });

  it('tags the game-camera helper as a camera transform in 3D', () => {
    const t = readGizmoTransform(src({ name: GAME_CAMERA_ID }), '3d', -10);
    expect(t.kind).toBe('camera');
  });

  it('pins the camera helper to the fixed depth and zero rotation in 2D', () => {
    const t = readGizmoTransform(src({ name: GAME_CAMERA_ID }), '2d', -10);
    expect(t.kind).toBe('camera');
    if (t.kind !== 'camera') throw new Error('expected camera');
    expect(t.position).toEqual({ x: 1, y: 2, z: -10 });
    expect(t.rotation).toEqual({ x: 0, y: 0, z: 0 });
  });
});
