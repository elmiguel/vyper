import { describe, it, expect } from 'vitest';
import type { GameSummary } from '@/data';
import { kindOf, toggleFilter, matchesFilter, filterProjects, type ProjectFilter } from './projectFilters';

function game(id: string, kind: '2d' | '3d' | 'model'): GameSummary {
  return {
    id, owner: 'me', name: id, description: '', activeSceneId: null,
    settings: { kind }, createdAt: '', updatedAt: '', sceneCount: 1,
  };
}

const g3d = game('a', '3d');
const g2d = game('b', '2d');
const model = game('c', 'model');

describe('kindOf', () => {
  it('reads game mode and model flag from settings', () => {
    expect(kindOf(g3d)).toEqual({ isModel: false, mode: '3d' });
    expect(kindOf(g2d)).toEqual({ isModel: false, mode: '2d' });
    expect(kindOf(model)).toEqual({ isModel: true, mode: '3d' });
  });
});

describe('toggleFilter', () => {
  it('makes "all" exclusive', () => {
    expect(toggleFilter(new Set<ProjectFilter>(['games', '3d']), 'all')).toEqual(new Set(['all']));
  });
  it('clears "all" when a specific chip is enabled', () => {
    expect(toggleFilter(new Set<ProjectFilter>(['all']), 'games')).toEqual(new Set(['games']));
  });
  it('adds chips cumulatively', () => {
    expect(toggleFilter(new Set<ProjectFilter>(['games']), '3d')).toEqual(new Set(['games', '3d']));
  });
  it('turning off the last chip falls back to "all"', () => {
    expect(toggleFilter(new Set<ProjectFilter>(['games']), 'games')).toEqual(new Set(['all']));
  });
});

describe('matchesFilter', () => {
  it('"all" matches everything', () => {
    const all = new Set<ProjectFilter>(['all']);
    expect([g3d, g2d, model].every((g) => matchesFilter(g, all))).toBe(true);
  });
  it('unions across enabled chips', () => {
    const f = new Set<ProjectFilter>(['models', '2d']);
    expect(matchesFilter(model, f)).toBe(true); // matches "models"
    expect(matchesFilter(g2d, f)).toBe(true);   // matches "2d"
    expect(matchesFilter(g3d, f)).toBe(false);  // matches neither
  });
  it('"games" excludes models', () => {
    const f = new Set<ProjectFilter>(['games']);
    expect(matchesFilter(g3d, f)).toBe(true);
    expect(matchesFilter(model, f)).toBe(false);
  });
});

describe('filterProjects', () => {
  it('preserves order and applies the union', () => {
    // models are 3D, so the "3d" chip includes them too
    expect(filterProjects([g3d, g2d, model], new Set(['3d']))).toEqual([g3d, model]);
    expect(filterProjects([g3d, g2d, model], new Set(['all']))).toEqual([g3d, g2d, model]);
  });
});
