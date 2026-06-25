import { describe, expect, it } from 'vitest';
import type { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
import type { SceneManager } from '@/babylon/SceneManager';
import { makeCameraApi } from './cameraApi';

/** Minimal UniversalCamera stand-in that records the position + target writes. */
function makeFakeCam() {
  const pos = { x: 0, y: 0, z: 0 };
  const target = { x: 0, y: 0, z: 0 };
  const cam = {
    rotation: { x: 0, y: 0 },
    position: {
      ...pos,
      set(x: number, y: number, z: number) {
        pos.x = x;
        pos.y = y;
        pos.z = z;
      },
    },
    setTarget(v: { x: number; y: number; z: number }) {
      target.x = v.x;
      target.y = v.y;
      target.z = v.z;
    },
  };
  return { cam: cam as unknown as UniversalCamera, pos, target };
}

const noScene = {} as SceneManager;
const dist = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

describe('cameraApi.followThirdPerson', () => {
  it('aims AT the entity and sits behind + above it (so the character is framed)', () => {
    const { cam, pos, target } = makeFakeCam();
    const api = makeCameraApi(cam, noScene, (t) => String(t));
    api.yaw = 0;
    api.pitch = 0;

    api.followThirdPerson({ position: { x: 0, y: 1, z: 0 } }, { distance: 6, height: 3 });

    // The camera looks straight at the entity's own position — not above it.
    expect(target).toEqual({ x: 0, y: 1, z: 0 });
    expect(pos.x).toBeCloseTo(0, 6);
    expect(pos.y).toBeCloseTo(4, 6); // entity.y(1) + height(3)
    expect(pos.z).toBeCloseTo(-6, 6); // distance(6) back along -Z (yaw 0 forward is +Z)
  });

  it('raises the camera and looks further down as pitch increases, still aiming at the entity', () => {
    const { cam, pos, target } = makeFakeCam();
    const api = makeCameraApi(cam, noScene, (t) => String(t));
    api.yaw = 0;
    api.pitch = 0.5; // look down ~28°

    api.followThirdPerson({ position: { x: 0, y: 1, z: 0 } }, { distance: 6, height: 3 });

    expect(target).toEqual({ x: 0, y: 1, z: 0 }); // always frames the entity
    expect(pos.y).toBeGreaterThan(4); // pitched-down look raises the camera
  });

  it('falls back to a sane distance when given a degenerate one (never collapses to first-person)', () => {
    const { cam, pos, target } = makeFakeCam();
    const api = makeCameraApi(cam, noScene, (t) => String(t));
    api.yaw = 0;
    api.pitch = 0;

    api.followThirdPerson({ position: { x: 0, y: 1, z: 0 } }, { distance: 0, height: 3 });

    // A 0 distance must NOT put the camera on the entity (the first-person bug):
    // it stays the fallback distance back and the fixed height up.
    expect(pos.z).toBeCloseTo(-6, 6);
    expect(dist(pos, target)).toBeGreaterThan(5);
  });
});
