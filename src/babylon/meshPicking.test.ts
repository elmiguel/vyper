import { describe, it, expect } from 'vitest';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { GAME_CAMERA_ID } from './editorObjects';
import { isCameraHelperMesh, idForMesh, isPickable, nextPick, pickIdsFromHits } from './meshPicking';

const pmesh = (name: string, entityId?: string) =>
  ({ name, metadata: entityId ? { entityId } : null } as unknown as AbstractMesh);

describe('pickIdsFromHits', () => {
  it('returns entity ids nearest-first, de-duplicated', () => {
    const hits = [
      { pickedMesh: pmesh('c'), distance: 9 },
      { pickedMesh: pmesh('a'), distance: 1 },
      { pickedMesh: pmesh('b'), distance: 5 },
      { pickedMesh: pmesh('a'), distance: 12 }, // dup of 'a' (farther) → dropped
    ];
    expect(pickIdsFromHits(hits)).toEqual(['a', 'b', 'c']);
  });
  it('collapses a model\'s child meshes to its one entity id', () => {
    const hits = [
      { pickedMesh: pmesh('Cube.001', 'model-1'), distance: 2 },
      { pickedMesh: pmesh('Cube.002', 'model-1'), distance: 3 },
    ];
    expect(pickIdsFromHits(hits)).toEqual(['model-1']);
  });
  it('skips null hits', () => {
    expect(pickIdsFromHits([{ pickedMesh: null, distance: 1 }])).toEqual([]);
  });
});

describe('nextPick (overlapping-object cycling)', () => {
  it('picks the nearest object on a fresh click', () => {
    expect(nextPick(['a', 'b', 'c'], null, false)).toBe('a');
    expect(nextPick(['a', 'b', 'c'], 'b', false)).toBe('a'); // different spot → topmost
  });
  it('cycles to the next object when clicking the same spot', () => {
    expect(nextPick(['a', 'b', 'c'], 'a', true)).toBe('b');
    expect(nextPick(['a', 'b', 'c'], 'b', true)).toBe('c');
    expect(nextPick(['a', 'b', 'c'], 'c', true)).toBe('a'); // wraps around
  });
  it('returns null when nothing is under the cursor', () => {
    expect(nextPick([], 'a', true)).toBeNull();
  });
  it('falls back to the nearest when the selection is not in the stack', () => {
    expect(nextPick(['a', 'b'], 'z', true)).toBe('a');
  });
});

// Minimal mesh stand-ins — the picking helpers only read name + metadata.
const mesh = (name: string, entityId?: string): AbstractMesh =>
  ({ name, metadata: entityId ? { entityId } : null } as unknown as AbstractMesh);

const tracked = (...ids: string[]) => {
  const m = new Map<string, { mesh?: AbstractMesh }>();
  for (const id of ids) m.set(id, { mesh: mesh(id) });
  return m;
};

describe('isCameraHelperMesh', () => {
  it('matches the helper body and its children', () => {
    expect(isCameraHelperMesh(mesh(GAME_CAMERA_ID))).toBe(true);
    expect(isCameraHelperMesh(mesh(`${GAME_CAMERA_ID}:lens`))).toBe(true);
  });
  it('rejects normal meshes', () => {
    expect(isCameraHelperMesh(mesh('box-1'))).toBe(false);
  });
});

describe('idForMesh', () => {
  it('maps the camera helper to the camera id', () => {
    expect(idForMesh(mesh(`${GAME_CAMERA_ID}:frustum`))).toBe(GAME_CAMERA_ID);
  });
  it('prefers a model child entityId tag, else the mesh name', () => {
    expect(idForMesh(mesh('Cube.001', 'ent-42'))).toBe('ent-42');
    expect(idForMesh(mesh('ent-7'))).toBe('ent-7');
  });
});

describe('isPickable', () => {
  it('always allows the camera helper', () => {
    expect(isPickable(mesh(GAME_CAMERA_ID), tracked())).toBe(true);
  });
  it('allows a tagged model child only when its entity is tracked', () => {
    expect(isPickable(mesh('Cube', 'ent-1'), tracked('ent-1'))).toBe(true);
    expect(isPickable(mesh('Cube', 'ghost'), tracked('ent-1'))).toBe(false);
  });
  it('allows a primitive only when it is the exact tracked mesh', () => {
    const t = tracked('ent-1');
    const real = t.get('ent-1')!.mesh!;
    expect(isPickable(real, t)).toBe(true);
    // Same name, different instance (stale) → not pickable.
    expect(isPickable(mesh('ent-1'), t)).toBe(false);
  });
});
