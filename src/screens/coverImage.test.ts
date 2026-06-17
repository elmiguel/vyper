import { describe, it, expect } from 'vitest';
import type { GameSummary } from '@/data';
import { defaultCover, coverBackground, hasCustomCover } from './coverImage';

function game(id: string, settings: Record<string, unknown>): GameSummary {
  return {
    id, owner: 'me', name: id, description: '', activeSceneId: null,
    settings, createdAt: '', updatedAt: '', sceneCount: 1,
  };
}

describe('defaultCover', () => {
  it('is deterministic for a given id', () => {
    const g = game('abc', { kind: '3d' });
    expect(defaultCover(g)).toBe(defaultCover(g));
  });
  it('tints models with the purple/magenta palette', () => {
    const cover = defaultCover(game('x', { kind: 'model' }));
    expect(cover).toMatch(/#b14aed|#ff2e97|#7a2fd0/);
  });
  it('tints 2D games with the green palette', () => {
    const cover = defaultCover(game('y', { kind: '2d' }));
    expect(cover).toMatch(/#3affc0|#1f8f6e|#1b8f8f/);
  });
});

describe('hasCustomCover', () => {
  it('detects a stored cover image', () => {
    expect(hasCustomCover(game('a', { kind: '3d', coverImage: 'data:image/png;base64,xxx' }))).toBe(true);
    expect(hasCustomCover(game('b', { kind: '3d' }))).toBe(false);
    expect(hasCustomCover(game('c', { kind: '3d', coverImage: '' }))).toBe(false);
  });
});

describe('coverBackground', () => {
  it('uses the uploaded image when present', () => {
    const bg = coverBackground(game('a', { kind: '3d', coverImage: 'data:image/png;base64,xxx' }));
    expect(bg).toContain('url("data:image/png;base64,xxx")');
    expect(bg).toContain('cover');
  });
  it('falls back to a generated gradient', () => {
    expect(coverBackground(game('a', { kind: '3d' }))).toContain('linear-gradient');
  });
  it('escapes quotes in the data URL', () => {
    const bg = coverBackground(game('a', { kind: '3d', coverImage: 'data:image/png,"evil"' }));
    expect(bg).not.toContain('"evil"');
    expect(bg).toContain('%22');
  });
});
