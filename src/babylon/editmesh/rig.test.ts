import { describe, it, expect } from 'vitest';
import {
  poseBones,
  autoWeights,
  linearBlendSkin,
  quatFromEuler,
  quatRotate,
  IDENTITY_QUAT,
  type RigSkeleton,
} from './rig';

// A 2-bone chain along +Y: root at origin (0→1), child (1→2).
const skel: RigSkeleton = {
  bones: [
    { id: 'root', name: 'root', parentId: null, head: { x: 0, y: 0, z: 0 }, tail: { x: 0, y: 1, z: 0 } },
    { id: 'child', name: 'child', parentId: 'root', head: { x: 0, y: 1, z: 0 }, tail: { x: 0, y: 2, z: 0 } },
  ],
};

describe('quatRotate', () => {
  it('rotates +X to +Z under a -90° rotation about Y', () => {
    const q = quatFromEuler(0, -90, 0);
    const r = quatRotate(q, { x: 1, y: 0, z: 0 });
    expect(r.x).toBeCloseTo(0, 5);
    expect(r.z).toBeCloseTo(1, 5);
  });
});

describe('poseBones', () => {
  it('is identity at rest', () => {
    const posed = poseBones(skel, {});
    expect(posed.get('child')!.head).toMatchObject({ x: 0, y: 1, z: 0 });
  });

  it('carries the child head when the root rotates', () => {
    // Rotate root 90° about Z: +Y maps to -X, so the child head (0,1,0) swings to (-1,0,0).
    const posed = poseBones(skel, { root: quatFromEuler(0, 0, 90) });
    const ch = posed.get('child')!;
    expect(ch.head.x).toBeCloseTo(-1, 5);
    expect(ch.head.y).toBeCloseTo(0, 5);
  });

  it('child rotation does not move its own head', () => {
    const posed = poseBones(skel, { child: quatFromEuler(0, 0, 45) });
    expect(posed.get('child')!.head).toMatchObject({ x: 0, y: 1, z: 0 });
  });
});

describe('autoWeights', () => {
  it('binds vertices to their nearest bone and normalizes to 1', () => {
    // Two vertices: one near the root segment, one near the child segment.
    const positions = [0.1, 0.2, 0, 0.1, 1.8, 0];
    const skin = autoWeights(positions, skel);
    // dominant influence of vertex 0 is the root (index 0), vertex 1 is the child (index 1)
    expect(skin.indices[0]).toBe(0);
    expect(skin.indices[4]).toBe(1);
    // weights per vertex sum to ~1
    const sum0 = skin.weights.slice(0, 4).reduce((a, b) => a + b, 0);
    const sum1 = skin.weights.slice(4, 8).reduce((a, b) => a + b, 0);
    expect(sum0).toBeCloseTo(1, 5);
    expect(sum1).toBeCloseTo(1, 5);
  });
});

describe('linearBlendSkin', () => {
  it('leaves the mesh unchanged at the rest pose', () => {
    const positions = [0, 0.5, 0, 0, 1.5, 0];
    const skin = autoWeights(positions, skel);
    const out = linearBlendSkin(positions, skin, skel, poseBones(skel, {}));
    for (let i = 0; i < positions.length; i++) expect(out[i]).toBeCloseTo(positions[i], 5);
  });

  it('bends child-bound vertices about the child head when the child rotates', () => {
    // A vertex fully weighted to the child, above its head.
    const positions = [0, 2, 0];
    const skin: { indices: number[]; weights: number[] } = { indices: [1, 0, 0, 0], weights: [1, 0, 0, 0] };
    // Rotate child 90° about Z: point (0,2,0) about head (0,1,0) → (-1,1,0).
    const out = linearBlendSkin(positions, skin, skel, poseBones(skel, { child: quatFromEuler(0, 0, 90) }));
    expect(out[0]).toBeCloseTo(-1, 5);
    expect(out[1]).toBeCloseTo(1, 5);
  });

  it('keeps root-bound vertices put when only the child bends', () => {
    const positions = [0, 0, 0];
    const skin = { indices: [0, 0, 0, 0], weights: [1, 0, 0, 0] };
    const out = linearBlendSkin(positions, skin, skel, poseBones(skel, { child: quatFromEuler(0, 0, 90) }));
    expect(out[0]).toBeCloseTo(0, 5);
    expect(out[1]).toBeCloseTo(0, 5);
  });
});

describe('IDENTITY_QUAT', () => {
  it('is a no-op rotation', () => {
    expect(quatRotate(IDENTITY_QUAT, { x: 3, y: -2, z: 1 })).toMatchObject({ x: 3, y: -2, z: 1 });
  });
});
