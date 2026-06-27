import { describe, it, expect } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Entity } from '@/types';
import { desiredMatKind, syncEntityMaterial } from './materials';

const ent = (over: Partial<Entity> = {}): Entity =>
  ({
    id: 'e1',
    name: 'e1',
    parentId: null,
    transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
    mesh: { kind: 'box', color: '#ffffff', visible: true },
    scriptIds: [],
    props: {},
    ...over,
  } as Entity);

describe('desiredMatKind', () => {
  it('uses flat StandardMaterial in 2D mode', () => {
    expect(desiredMatKind(ent(), '2d')).toBe('std');
  });

  it('uses flat StandardMaterial for trigger volumes (even in 3D)', () => {
    expect(desiredMatKind(ent({ trigger: { enabled: true, once: false, filter: [] } }), '3d')).toBe('std');
  });

  it('defaults a plain 3D mesh to PBR', () => {
    expect(desiredMatKind(ent(), '3d')).toBe('pbr');
  });

  it("honors an explicit 'standard' shading choice in 3D", () => {
    const e = ent({ mesh: { kind: 'box', color: '#fff', visible: true, material: { shading: 'standard', metallic: 0, roughness: 1 } } });
    expect(desiredMatKind(e, '3d')).toBe('std');
  });

  it("uses PBR for an explicit 'pbr' shading choice", () => {
    const e = ent({ mesh: { kind: 'box', color: '#fff', visible: true, material: { shading: 'pbr', metallic: 1, roughness: 0.2 } } });
    expect(desiredMatKind(e, '3d')).toBe('pbr');
  });

  it("uses the foliage kind for 'foliage' shading in 3D", () => {
    const e = ent({ mesh: { kind: 'box', color: '#0f0', visible: true, material: { shading: 'foliage', metallic: 0, roughness: 1 } } });
    expect(desiredMatKind(e, '3d')).toBe('foliage');
  });

  it('falls back to flat StandardMaterial for foliage in 2D', () => {
    const e = ent({ mesh: { kind: 'box', color: '#0f0', visible: true, material: { shading: 'foliage', metallic: 0, roughness: 1 } } });
    expect(desiredMatKind(e, '2d')).toBe('std');
  });
});

describe('syncEntityMaterial double-siding', () => {
  it('renders kernel custom meshes double-sided, primitives single-sided', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);

    const custom = new Mesh('custom', scene);
    syncEntityMaterial(scene, custom, ent({ mesh: { kind: 'custom', color: '#fff', visible: true } }), '3d', undefined);
    expect(custom.material!.backFaceCulling).toBe(false);

    const prim = new Mesh('prim', scene);
    syncEntityMaterial(scene, prim, ent(), '3d', undefined);
    expect(prim.material!.backFaceCulling).toBe(true);

    scene.dispose();
    engine.dispose();
  });
});
