import { describe, it, expect } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import type { CustomGeometry } from '@/types';
import { buildCustomMesh, toCustomGeometry } from './customMesh';

// A single triangle in the XY plane.
const tri: CustomGeometry = {
  positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
  indices: [0, 1, 2],
  normals: [],
};

describe('buildCustomMesh + toCustomGeometry', () => {
  it('builds a mesh from baked geometry and reads it back', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);

    const mesh = buildCustomMesh(scene, 'tri', tri);
    expect(mesh.getTotalVertices()).toBe(3);

    const geo = toCustomGeometry(mesh);
    expect(geo.positions).toEqual(tri.positions);
    expect(geo.indices).toEqual([0, 1, 2]);
    // Normals were absent → computed at build time, so they round-trip non-empty.
    expect(geo.normals.length).toBe(9);

    scene.dispose();
    engine.dispose();
  });
});
