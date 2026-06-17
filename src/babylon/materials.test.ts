import { describe, it, expect } from 'vitest';
import type { Entity } from '@/types';
import { desiredMatKind } from './materials';

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
});
