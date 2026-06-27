import { describe, it, expect } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Entity } from '@/types';
import { defaultGrass } from '@/types';
import { bladeCountFor, sampleTerrainHeight, buildGrass, grassKeyFor } from './grassSystem';

const terrainEntity = (over: Partial<Entity> = {}): Entity =>
  ({
    id: 'terra',
    name: 'terra',
    parentId: null,
    transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
    mesh: { kind: 'terrain', color: '#888', visible: true, terrain: { size: 4, subdivisions: 1, maxHeight: 10, heights: [] } },
    scriptIds: [],
    props: {},
    ...over,
  } as Entity);

describe('bladeCountFor', () => {
  it('scales with density × area and rounds', () => {
    expect(bladeCountFor({ ...defaultGrass(), density: 2 }, 16)).toBe(32);
  });
  it('is zero at zero density', () => {
    expect(bladeCountFor({ ...defaultGrass(), density: 0 }, 1000)).toBe(0);
  });
  it('clamps to the hard cap', () => {
    expect(bladeCountFor({ ...defaultGrass(), density: 1e9 }, 1e9)).toBeLessThanOrEqual(60000);
  });
});

describe('sampleTerrainHeight', () => {
  const t = { size: 4, subdivisions: 1, maxHeight: 10, heights: [0, 0, 0, 1] };
  it('returns 0 for an empty (flat) heightfield', () => {
    expect(sampleTerrainHeight({ ...t, heights: [] }, 0, 0)).toBe(0);
  });
  it('bilinearly interpolates the heightfield × maxHeight', () => {
    // Center of a field whose far corner is 1 → quarter height.
    expect(sampleTerrainHeight(t, 0, 0)).toBeCloseTo(2.5, 4);
    // The high corner reaches full maxHeight.
    expect(sampleTerrainHeight(t, 2, 2)).toBeCloseTo(10, 4);
  });
});

describe('grassKeyFor', () => {
  it('is null without grass and changes when grass changes', () => {
    expect(grassKeyFor(terrainEntity())).toBeNull();
    const a = grassKeyFor(terrainEntity({ mesh: { ...terrainEntity().mesh!, grass: defaultGrass() } }));
    const b = grassKeyFor(terrainEntity({ mesh: { ...terrainEntity().mesh!, grass: { ...defaultGrass(), density: 20 } } }));
    expect(a).not.toBeNull();
    expect(a).not.toBe(b);
  });
});

describe('buildGrass', () => {
  it('scatters the expected number of thin instances over a terrain', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    new HemisphericLight('h', new Vector3(0, 1, 0), scene);
    const host = MeshBuilder.CreateGround('host', { width: 4, height: 4 }, scene);
    const e = terrainEntity({ mesh: { ...terrainEntity().mesh!, grass: { ...defaultGrass(), density: 2 } } });

    const grass = buildGrass(scene, host, e);
    expect(grass).not.toBeNull();
    expect(grass!.name).toContain('grass');
    expect(grass!.thinInstanceCount).toBe(32); // density 2 × area 16
    expect(grass!.isPickable).toBe(false);

    scene.dispose();
    engine.dispose();
  });

  it('returns null when density is zero (nothing to grow)', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const host = MeshBuilder.CreateGround('host', { width: 4, height: 4 }, scene);
    const e = terrainEntity({ mesh: { ...terrainEntity().mesh!, grass: { ...defaultGrass(), density: 0 } } });
    expect(buildGrass(scene, host, e)).toBeNull();
    scene.dispose();
    engine.dispose();
  });
});
