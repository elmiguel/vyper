import { describe, it, expect, vi } from 'vitest';
import { Vector3, Matrix } from '@babylonjs/core/Maths/math.vector';
import type { SceneManager } from '@/babylon/SceneManager';
import type { Entity } from '@/types';
import { defaultVolume } from '@/types';
import { VolumeEnforcer } from './VolumeEnforcer';

/** A fake mesh: a fixed world matrix + absolute position (no Babylon scene needed). */
function fakeMesh(world: Matrix, abs = Vector3.Zero()) {
  return {
    getWorldMatrix: () => world,
    getAbsolutePosition: () => abs,
    isEnabled: () => true,
  };
}

function ent(over: Partial<Entity>): Entity {
  return {
    id: 'x', name: 'x', parentId: null,
    transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
    scriptIds: [], props: {},
    ...over,
  } as Entity;
}

/** SceneManager stub exposing only what VolumeEnforcer touches. */
function fakeSM(meshes: Record<string, ReturnType<typeof fakeMesh>>) {
  const reposition = vi.fn();
  const destroy = vi.fn();
  const sm = {
    gameCamera: { globalPosition: new Vector3(100, 100, 100) }, // far outside
    scene: { fogMode: 0, fogColor: null, fogDensity: 0 },
    getMesh: (id: string) => meshes[id],
    getBody: () => null,
    repositionEntity: reposition,
    destroyRuntimeEntity: destroy,
    constrainEntity: vi.fn(),
  } as unknown as SceneManager;
  return { sm, reposition, destroy };
}

describe('VolumeEnforcer — dead zone', () => {
  // A box volume scaled ×4 at the origin (world half-extent 2) + a player sitting at the origin.
  const volMesh = fakeMesh(Matrix.Scaling(4, 4, 4));
  const playerInside = fakeMesh(Matrix.Identity(), new Vector3(0, 0, 0));

  const deadZoneVol = ent({
    id: 'vol', name: 'Dead', mesh: { kind: 'box', color: '#fff', visible: true } as Entity['mesh'],
    trigger: { enabled: true, once: false, filter: [], volume: { ...defaultVolume(), preset: 'deadZone', respawn: true } } as Entity['trigger'],
  });
  const player = ent({
    id: 'player', name: 'Player', mesh: { kind: 'box', color: '#00f', visible: true } as Entity['mesh'],
    transform: { position: { x: 0, y: 5, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
  });

  it('respawns a player that is inside the dead zone to its spawn point', () => {
    const { sm, reposition } = fakeSM({ vol: volMesh, player: playerInside });
    const enf = new VolumeEnforcer(sm);
    enf.build([deadZoneVol, player]);
    enf.tick(0.016);
    expect(reposition).toHaveBeenCalledTimes(1);
    const [id, pos] = reposition.mock.calls[0];
    expect(id).toBe('player');
    expect(pos.y).toBeCloseTo(5); // back to the authored spawn
  });

  it('destroys instead of respawning when respawn is off', () => {
    const vol = ent({
      ...deadZoneVol,
      trigger: { enabled: true, once: false, filter: [], volume: { ...defaultVolume(), preset: 'deadZone', respawn: false } } as Entity['trigger'],
    });
    const { sm, reposition, destroy } = fakeSM({ vol: volMesh, player: playerInside });
    const enf = new VolumeEnforcer(sm);
    enf.build([vol, player]);
    enf.tick(0.016);
    expect(destroy).toHaveBeenCalledWith('player');
    expect(reposition).not.toHaveBeenCalled();
  });

  it('does NOT respawn a player outside the dead zone', () => {
    const playerOutside = fakeMesh(Matrix.Identity(), new Vector3(0, 50, 0)); // far above the ×4 box
    const { sm, reposition } = fakeSM({ vol: volMesh, player: playerOutside });
    const enf = new VolumeEnforcer(sm);
    enf.build([deadZoneVol, player]);
    enf.tick(0.016);
    expect(reposition).not.toHaveBeenCalled();
  });

  it('catches a fast faller that tunnels past the box between frames (swept detection)', () => {
    // Frame 1: player above the box. Frame 2: player below it — never sampled inside, but the
    // path from above→below crosses the volume, so swept detection must still respawn it.
    const moving = fakeMesh(Matrix.Identity(), new Vector3(0, 6, 0));
    const { sm, reposition } = fakeSM({ vol: volMesh, player: moving });
    const enf = new VolumeEnforcer(sm);
    enf.build([deadZoneVol, player]);
    enf.tick(0.016); // above (records prevLocal)
    expect(reposition).not.toHaveBeenCalled();
    moving.getAbsolutePosition = () => new Vector3(0, -6, 0); // jumped clean past the ×4 box
    enf.tick(0.016);
    expect(reposition).toHaveBeenCalledTimes(1);
    expect(reposition.mock.calls[0][0]).toBe('player');
  });
});
