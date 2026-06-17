import { describe, it, expect } from 'vitest';
import type { Entity } from '@/types';
import { dedupeEntityIds } from './editorDefaults';

const box = (id: string, name = id): Entity =>
  ({
    id, name, parentId: null,
    transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
    mesh: { kind: 'box', color: '#fff', visible: true },
    scriptIds: [], props: {},
  } as Entity);

describe('dedupeEntityIds', () => {
  it('reassigns fresh ids to entities that share an id (legacy duplicate bug)', () => {
    const fixed = dedupeEntityIds([box('a', 'Box'), box('a', 'Box'), box('a', 'Box 2')]);
    const ids = fixed.map((e) => e.id);
    expect(new Set(ids).size).toBe(3); // all distinct now
    expect(ids[0]).toBe('a'); // first keeps its id
    // Names/config are preserved; only ids changed.
    expect(fixed.map((e) => e.name)).toEqual(['Box', 'Box', 'Box 2']);
  });

  it('returns the SAME array reference when there are no duplicates (no churn)', () => {
    const clean = [box('a'), box('b'), box('c')];
    expect(dedupeEntityIds(clean)).toBe(clean);
  });
});
